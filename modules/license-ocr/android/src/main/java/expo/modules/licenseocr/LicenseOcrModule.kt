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
 * On-device OCR POC (owner decision 2026-09-28): Tesseract 5 through Tesseract4Android.
 * Everything runs in this process — no network, no telemetry. The recognized text is returned to
 * the caller only; it is never logged or written anywhere by this module.
 */
class LicenseOcrModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "No context", null)

  override fun definition() = ModuleDefinition {
    Name("LicenseOcr")

    /** Recognizes the image at `uri` (file:// or content://) with `languages` (e.g. "heb+eng"). */
    AsyncFunction("recognize") { uri: String, languages: String ->
      val started = System.nanoTime()
      val source = decode(uri) ?: throw CodedException("ERR_IMAGE", "Unreadable image", null)
      val api = TessBaseAPI()
      try {
        if (!api.init(tessDir().absolutePath, languages, TessBaseAPI.OEM_LSTM_ONLY)) {
          throw CodedException("ERR_INIT", "Tesseract init failed", null)
        }
        api.setPageSegMode(TessBaseAPI.PageSegMode.PSM_AUTO)
        // Upright first; a sideways photo of the card is retried at 90° / 270°.
        var best = run(api, source, 0)
        if (best.mean < 55) {
          for (deg in intArrayOf(90, 270)) {
            val r = run(api, source, deg)
            if (r.mean > best.mean) best = r
          }
        }
        // Second pass: digits and dashes only (sparse text) on the best orientation — plate digits
        // on photographed cards are often read better without the Hebrew/Latin models competing.
        api.setVariable("tessedit_char_whitelist", "0123456789-")
        api.setPageSegMode(TessBaseAPI.PageSegMode.PSM_SPARSE_TEXT)
        val digits = run(api, source, best.rotation)
        mapOf(
          "lines" to best.lines,
          "digitLines" to digits.lines,
          "meanConfidence" to best.mean,
          "rotation" to best.rotation,
          "width" to source.width,
          "height" to source.height,
          "ms" to (System.nanoTime() - started) / 1_000_000,
        )
      } finally {
        api.recycle()
        source.recycle()
      }
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
