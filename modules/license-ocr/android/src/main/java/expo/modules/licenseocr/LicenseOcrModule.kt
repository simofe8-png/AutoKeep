package expo.modules.licenseocr

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.googlecode.tesseract.android.TessBaseAPI
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

/**
 * On-device license OCR: Tesseract 5 through Tesseract4Android. Everything runs in this process —
 * no network, no telemetry. The recognized text is returned to the caller only; it is never logged
 * or written anywhere by this module.
 *
 * AutoKeep needs ONE field from the license: the registration number. The image (typically the
 * user's crop around the plate number) is read several times — a labelled pass (heb+eng, for the
 * "מספר רכב" label context) and digits-only passes on independently preprocessed versions (gray
 * with contrast stretch, Otsu binarization, 2× upscale for small crops). The caller votes across
 * passes; nothing here decides what the plate is.
 */
class LicenseOcrModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "No context", null)

  override fun definition() = ModuleDefinition {
    Name("LicenseOcr")

    /** Reads the image at `uri` (file:// or content://). `languages` e.g. "heb+eng". */
    AsyncFunction("recognize") { uri: String, languages: String ->
      val started = System.nanoTime()
      val source = decode(uri) ?: throw CodedException("ERR_IMAGE", "Unreadable image", null)
      val gray = grayStretched(source)
      source.recycle()
      val passes = mutableListOf<Map<String, Any>>()
      var best: Pass
      val labelled = TessBaseAPI()
      try {
        if (!labelled.init(tessDir().absolutePath, languages, TessBaseAPI.OEM_LSTM_ONLY)) {
          throw CodedException("ERR_INIT", "Tesseract init failed", null)
        }
        labelled.setPageSegMode(TessBaseAPI.PageSegMode.PSM_AUTO)
        // Upright first; a sideways photo is retried at 90° / 270°.
        best = run(labelled, gray, 0)
        if (best.mean < 55) {
          for (deg in intArrayOf(90, 270)) {
            val r = run(labelled, gray, deg)
            if (r.mean > best.mean) best = r
          }
        }
      } finally {
        labelled.recycle()
      }

      val upright = if (best.rotation == 0) gray else rotate(gray, best.rotation)
      val variants = linkedMapOf<String, Bitmap>("gray" to upright)
      val binary = otsu(upright)
      variants["otsu"] = binary
      if (maxOf(upright.width, upright.height) < 1600) variants["otsu2x"] = scale(binary, 2f)
      // A tight crop around the number is one wide line: read it as a single line as well.
      val wide = upright.width >= upright.height * 3
      val modes = if (wide) {
        listOf("line" to TessBaseAPI.PageSegMode.PSM_SINGLE_LINE, "sparse" to TessBaseAPI.PageSegMode.PSM_SPARSE_TEXT)
      } else {
        listOf("sparse" to TessBaseAPI.PageSegMode.PSM_SPARSE_TEXT, "block" to TessBaseAPI.PageSegMode.PSM_SINGLE_BLOCK)
      }
      val digits = TessBaseAPI()
      try {
        if (!digits.init(tessDir().absolutePath, "eng", TessBaseAPI.OEM_LSTM_ONLY)) {
          throw CodedException("ERR_INIT", "Tesseract init failed", null)
        }
        digits.setVariable("tessedit_char_whitelist", "0123456789-")
        for ((name, bitmap) in variants) {
          for ((modeName, mode) in modes) {
            digits.setPageSegMode(mode)
            passes.add(mapOf("pass" to "$name:$modeName", "lines" to run(digits, bitmap, 0).lines))
          }
        }
      } finally {
        digits.recycle()
        for (b in variants.values) if (b !== gray) b.recycle()
        if (upright !== gray) upright.recycle()
        gray.recycle()
      }
      mapOf(
        "lines" to best.lines,
        "digitPasses" to passes,
        "meanConfidence" to best.mean,
        "rotation" to best.rotation,
        "ms" to (System.nanoTime() - started) / 1_000_000,
      )
    }
  }

  private class Pass(val rotation: Int, val mean: Int, val lines: List<Map<String, Any>>)

  private fun run(api: TessBaseAPI, source: Bitmap, degrees: Int): Pass {
    val bitmap = if (degrees == 0) source else rotate(source, degrees)
    try {
      api.setImage(bitmap)
      api.getUTF8Text() // runs recognition
      val lines = mutableListOf<Map<String, Any>>()
      val it = api.resultIterator
      if (it != null) {
        try {
          it.begin()
          do {
            val text = it.getUTF8Text(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE)?.trim()
            if (!text.isNullOrEmpty()) {
              lines.add(
                mapOf(
                  "text" to text,
                  "confidence" to it.confidence(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE) / 100.0,
                ),
              )
            }
          } while (it.next(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE))
        } finally {
          it.delete()
        }
      }
      return Pass(degrees, api.meanConfidence(), lines)
    } finally {
      if (bitmap !== source) bitmap.recycle()
    }
  }

  /** Luminance with a 1%–99% contrast stretch (uneven light, faded print). */
  private fun grayStretched(b: Bitmap): Bitmap {
    val w = b.width
    val h = b.height
    val px = IntArray(w * h)
    b.getPixels(px, 0, w, 0, 0, w, h)
    val lum = IntArray(px.size)
    val hist = IntArray(256)
    for (i in px.indices) {
      val c = px[i]
      val y = ((c shr 16 and 0xff) * 299 + (c shr 8 and 0xff) * 587 + (c and 0xff) * 114) / 1000
      lum[i] = y
      hist[y]++
    }
    val lo = percentile(hist, px.size, 0.01)
    val hi = percentile(hist, px.size, 0.99)
    val span = maxOf(1, hi - lo)
    for (i in px.indices) {
      val v = ((lum[i] - lo) * 255 / span).coerceIn(0, 255)
      px[i] = (0xff shl 24) or (v shl 16) or (v shl 8) or v
    }
    return Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
  }

  private fun percentile(hist: IntArray, total: Int, p: Double): Int {
    val target = (total * p).toLong()
    var acc = 0L
    for (i in hist.indices) {
      acc += hist[i]
      if (acc >= target) return i
    }
    return 255
  }

  /** Global Otsu binarization of a gray bitmap. */
  private fun otsu(gray: Bitmap): Bitmap {
    val w = gray.width
    val h = gray.height
    val px = IntArray(w * h)
    gray.getPixels(px, 0, w, 0, 0, w, h)
    val hist = IntArray(256)
    for (c in px) hist[c and 0xff]++
    var sum = 0.0
    for (i in 0..255) sum += i.toDouble() * hist[i]
    var sumB = 0.0
    var wB = 0
    var best = 0.0
    var threshold = 127
    for (t in 0..255) {
      wB += hist[t]
      if (wB == 0) continue
      val wF = px.size - wB
      if (wF == 0) break
      sumB += t.toDouble() * hist[t]
      val mB = sumB / wB
      val mF = (sum - sumB) / wF
      val between = wB.toDouble() * wF * (mB - mF) * (mB - mF)
      if (between > best) {
        best = between
        threshold = t
      }
    }
    for (i in px.indices) {
      val v = if ((px[i] and 0xff) > threshold) 255 else 0
      px[i] = (0xff shl 24) or (v shl 16) or (v shl 8) or v
    }
    return Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
  }

  private fun scale(b: Bitmap, f: Float): Bitmap =
    Bitmap.createScaledBitmap(b, (b.width * f).toInt(), (b.height * f).toInt(), true)

  /** Bundled traineddata, copied once to no-backup app storage (never included in backups). */
  private fun tessDir(): File {
    val root = File(context.noBackupFilesDir, "tesseract")
    val data = File(root, "tessdata")
    data.mkdirs()
    for (lang in arrayOf("heb", "eng")) {
      val target = File(data, "$lang.traineddata")
      if (!target.exists() || target.length() == 0L) {
        val tmp = File(data, "$lang.traineddata.tmp")
        context.assets.open("tessdata/$lang.traineddata").use { input ->
          FileOutputStream(tmp).use { output -> input.copyTo(output) }
        }
        tmp.renameTo(target)
      }
    }
    return root
  }

  /** Decodes, downsamples (long side ≤ 2400 px) and applies the EXIF orientation. */
  private fun decode(uri: String): Bitmap? {
    val parsed = Uri.parse(uri)
    val resolver = context.contentResolver
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(parsed)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 2400) sample *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    val bitmap = resolver.openInputStream(parsed)?.use { BitmapFactory.decodeStream(it, null, options) }
      ?: return null
    val orientation = resolver.openInputStream(parsed)?.use {
      ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    } ?: ExifInterface.ORIENTATION_NORMAL
    val degrees = when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> 90
      ExifInterface.ORIENTATION_ROTATE_180 -> 180
      ExifInterface.ORIENTATION_ROTATE_270 -> 270
      else -> 0
    }
    if (degrees == 0) return bitmap
    val upright = rotate(bitmap, degrees)
    bitmap.recycle()
    return upright
  }

  private fun rotate(b: Bitmap, degrees: Int): Bitmap =
    Bitmap.createBitmap(b, 0, 0, b.width, b.height, Matrix().apply { postRotate(degrees.toFloat()) }, true)
}
