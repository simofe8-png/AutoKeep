/**
 * Service-table reader (owner decision 2026-10-06): reads a booklet's maintenance table — a grid of
 * items × service columns whose cells hold action letters (ב / ה / כ / ס / ח / נ) — from ONE page
 * image, on the device. A full-page OCR pass misses the single letters inside the grid, so the
 * grid is found first (ruled lines), the lines are erased, and every row is read by column.
 *
 * Plain ES5, no imports: inlined into assets/ocr/ocr-reader.html by tools/build-ocr-webview.mjs and
 * loaded as-is by the Node test harness. It never decides what the table means — it returns the
 * cells' text by position; the app parses and the owner reviews.
 *
 * readServiceTable(img, ocr)
 *   img: { w, h, data: Uint8Array } — grey, 0 = black.
 *   ocr(img, opts) → [{ text, x, y, w, h, conf }] words; opts: { psm, whitelist }.
 *   → null (no ruled table on the page) or
 *     { angle, rows: [{ y0, y1, group, label: [text per label column], data: [text|null],
 *       merged: text|null }], dataColumns, below: [text lines under the table] }
 */
/* eslint-disable no-var -- plain ES5 so it can be inlined into the WebView page as-is */
// eslint-disable-next-line no-unused-vars -- called by the page and the test harness
function readServiceTable(img, ocr) {
  'use strict';

  function integral(src, w, h) {
    var ii = new Float64Array((w + 1) * (h + 1));
    for (var y = 0; y < h; y++) {
      var row = 0;
      for (var x = 0; x < w; x++) {
        row += src[y * w + x];
        ii[(y + 1) * (w + 1) + x + 1] = ii[y * (w + 1) + x + 1] + row;
      }
    }
    return ii;
  }

  /** Dark (1) where a pixel is clearly darker than its neighbourhood: uneven light in photos. */
  function binarize(g) {
    var w = g.w,
      h = g.h,
      d = g.data;
    var ii = integral(d, w, h);
    var r = Math.max(8, Math.round(Math.min(w, h) / 80));
    var out = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      var y0 = Math.max(0, y - r),
        y1 = Math.min(h, y + r + 1);
      for (var x = 0; x < w; x++) {
        var x0 = Math.max(0, x - r),
          x1 = Math.min(w, x + r + 1);
        var sum =
          ii[y1 * (w + 1) + x1] -
          ii[y0 * (w + 1) + x1] -
          ii[y1 * (w + 1) + x0] +
          ii[y0 * (w + 1) + x0];
        var mean = sum / ((y1 - y0) * (x1 - x0));
        out[y * w + x] = d[y * w + x] < mean - 18 && d[y * w + x] < 200 ? 1 : 0;
      }
    }
    return out;
  }

  /** Small rotation (±4°) that makes the ruled lines horizontal. */
  /**
   * The page's tilt (±6°) that makes the ruled lines horizontal: a coarse search, then a fine one
   * (0.02°) — a residue of a few tenths of a degree already shifts a column line across the page.
   */
  function skew(bin, w, h) {
    var hist = new Float64Array(h * 2);
    function score(a, step) {
      var t = Math.tan((a * Math.PI) / 180);
      hist.fill(0);
      // The page's inside only: edges and the background around a photographed page would
      // pull the estimate to 0°.
      for (var y = Math.round(h * 0.06); y < h * 0.94; y += step) {
        for (var x = Math.round(w * 0.06); x < w * 0.94; x += step) {
          if (bin[y * w + x]) {
            // Bins as wide as the sampling step (otherwise 0° alone fills every other bin and
            // scores falsely high).
            var yy = Math.round((y - (x - w / 2) * t + h / 2) / step);
            if (yy >= 0 && yy < hist.length) hist[yy]++;
          }
        }
      }
      var s = 0;
      for (var i = 0; i < hist.length; i++) s += hist[i] * hist[i];
      return s;
    }
    function search(from, to, by, step, start) {
      var best = start,
        bestScore = -1;
      for (var a = from; a <= to + 1e-9; a += by) {
        var sc = score(a, step);
        if (sc > bestScore) {
          bestScore = sc;
          best = a;
        }
      }
      return best;
    }
    var coarse = search(-6, 6, 0.25, 2, 0);
    var fine = search(coarse - 0.3, coarse + 0.3, 0.02, 1, coarse);
    // Below half a degree the grid is found as it is; turning it would only blur the letters.
    return Math.abs(fine) < 0.5 ? 0 : fine;
  }

  function rotate(g, deg) {
    var w = g.w,
      h = g.h,
      out = new Uint8Array(w * h);
    var c = Math.cos((deg * Math.PI) / 180),
      s = Math.sin((deg * Math.PI) / 180);
    var cx = w / 2,
      cy = h / 2;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        // Inverse mapping, interpolated (a nearest pixel would break thin letter strokes).
        var fx = c * (x - cx) - s * (y - cy) + cx;
        var fy = s * (x - cx) + c * (y - cy) + cy;
        var x0 = Math.floor(fx),
          y0 = Math.floor(fy);
        if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) {
          out[y * w + x] = 255;
          continue;
        }
        var ax = fx - x0,
          ay = fy - y0,
          i0 = y0 * w + x0;
        out[y * w + x] = Math.round(
          (g.data[i0] * (1 - ax) + g.data[i0 + 1] * ax) * (1 - ay) +
            (g.data[i0 + w] * (1 - ax) + g.data[i0 + w + 1] * ax) * ay,
        );
      }
    }
    return { w: w, h: h, data: out };
  }

  /** Groups consecutive positions into lines: [{ at, from, to }]. */
  function groupRuns(flags) {
    var out = [],
      start = -1;
    for (var i = 0; i <= flags.length; i++) {
      if (i < flags.length && flags[i]) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        out.push({ at: Math.round((start + i - 1) / 2), from: start, to: i - 1 });
        start = -1;
      }
    }
    return out;
  }

  /** Longest dark run along a row (gaps of ≤ 3 px bridged). */
  function rowRun(bin, w, y, x0, x1) {
    var best = 0,
      run = 0,
      gap = 0;
    for (var x = x0; x < x1; x++) {
      var dark = bin[y * w + x] || (y > 0 && bin[(y - 1) * w + x]) || bin[(y + 1) * w + x];
      if (dark) {
        run += 1 + gap;
        gap = 0;
      } else if (run && gap < 3) gap++;
      else {
        run = 0;
        gap = 0;
      }
      if (run > best) best = run;
    }
    return best;
  }

  function cropImg(g, x0, y0, x1, y1, pad) {
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(g.w, Math.ceil(x1));
    y1 = Math.min(g.h, Math.ceil(y1));
    var cw = x1 - x0,
      ch = y1 - y0;
    if (cw < 4 || ch < 4) return null;
    var p = pad || 0,
      W = cw + 2 * p,
      H = ch + 2 * p;
    var out = new Uint8Array(W * H).fill(255);
    for (var y = 0; y < ch; y++) {
      for (var x = 0; x < cw; x++) out[(y + p) * W + x + p] = g.data[(y + y0) * g.w + x + x0];
    }
    return { w: W, h: H, data: out, ox: x0 - p, oy: y0 - p };
  }

  function ink(bin, w, x0, y0, x1, y1) {
    var n = 0;
    for (var y = Math.floor(y0); y < y1; y++)
      for (var x = Math.floor(x0); x < x1; x++) n += bin[y * w + x];
    return n;
  }

  /**
   * Words in reading order: lines top to bottom, each right to left (Hebrew), except a run of
   * English / numbers inside it, which keeps its own left-to-right order ("1.6L Ti-VCT").
   */
  var LTR = /^[A-Za-z0-9][A-Za-z0-9.,:+\-/%]*$/;
  function text(words) {
    var lines = [];
    words
      .slice()
      .sort(function (a, b) {
        return a.y + a.h / 2 - (b.y + b.h / 2);
      })
      .forEach(function (wd) {
        var last = lines[lines.length - 1];
        if (last && Math.abs(last.yc - (wd.y + wd.h / 2)) < Math.max(wd.h, last.h) * 0.6) {
          last.words.push(wd);
        } else lines.push({ yc: wd.y + wd.h / 2, h: wd.h, words: [wd] });
      });
    return lines
      .map(function (l) {
        var w = l.words.sort(function (a, b) {
          return b.x - a.x;
        });
        var out = [];
        for (var i = 0; i < w.length;) {
          if (!LTR.test(w[i].text)) {
            out.push(w[i++].text);
            continue;
          }
          var run = [];
          while (i < w.length && LTR.test(w[i].text)) run.push(w[i++].text);
          out.push.apply(out, run.reverse());
        }
        return out.join(' ');
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ---- 1. straighten ----
  var g = img;
  var bin = binarize(g);
  var angle = skew(bin, g.w, g.h);
  if (angle) {
    g = rotate(g, angle);
    bin = binarize(g);
  }
  var w = g.w,
    h = g.h;

  // ---- 2. horizontal ruled lines, the table = the largest close group ----
  var hFlags = [];
  for (var y = 1; y < h - 1; y++) hFlags.push(rowRun(bin, w, y, 0, w) >= w * 0.3);
  hFlags.unshift(false);
  hFlags.push(false);
  var hLines = groupRuns(hFlags).filter(function (l) {
    return l.to - l.from < h * 0.01 + 3;
  });
  if (hLines.length < 4) return null;
  var groups = [[hLines[0]]];
  for (var i = 1; i < hLines.length; i++) {
    if (hLines[i].at - hLines[i - 1].at < h * 0.07) groups[groups.length - 1].push(hLines[i]);
    else groups.push([hLines[i]]);
  }
  var lines = groups.reduce(function (a, b) {
    return b.length > a.length ? b : a;
  });
  if (lines.length < 4) return null;
  var top = lines[0].at,
    bottom = lines[lines.length - 1].at;
  var tableH = bottom - top;

  // ---- 3. vertical ruled lines inside the table ----
  var vFlags = [];
  for (var x = 0; x < w; x++) {
    var n = 0;
    for (var yy = top; yy <= bottom; yy++) {
      var r = yy * w;
      if (bin[r + x] || (x > 0 && bin[r + x - 1]) || (x < w - 1 && bin[r + x + 1])) n++;
    }
    vFlags.push(n >= tableH * 0.45);
  }
  var vLines = groupRuns(vFlags).filter(function (l) {
    return l.to - l.from < w * 0.01 + 3;
  });
  if (vLines.length < 6) return null;

  // ---- 4. erase the lines — only where a line is actually drawn ----
  // A line is erased along its long dark runs only. Where it is interrupted (a heading spanning
  // several rows, a rule written across the columns) the text there stays intact.
  var clean = new Uint8Array(g.data);
  var minRun = Math.max(40, Math.round(Math.min(w, h) * 0.02));
  /** Erases long runs, and short stubs (≤ 12 px) where a crossing line meets (`nearCross(i)`). */
  function eraseRuns(len, darkAt, erase, nearCross) {
    var start = -1;
    for (var i = 0; i <= len; i++) {
      if (i < len && darkAt(i)) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        if (i - start >= minRun || (i - start <= 12 && (nearCross(start) || nearCross(i - 1)))) {
          for (var k = start; k < i; k++) erase(k);
        }
        start = -1;
      }
    }
  }
  var nearLine = function (list, at) {
    return list.some(function (l) {
      return at >= l.from - 6 && at <= l.to + 6;
    });
  };
  // Pixel row by pixel row (column by column for vertical lines): a slanted or broken line is
  // removed, while a letter stroke touching the line (the ascender of ל, the tail of ף) is a short
  // run in any single row and stays.
  var white = function (x, y) {
    if (x >= 0 && x < w && y >= 0 && y < h) clean[y * w + x] = 255;
  };
  // Where a letter stroke continues beyond a row line (an ascender or a tail), the line pixels
  // there are kept: they belong to the letter as much as to the line.
  var dark = function (x, y) {
    return x >= 0 && x < w && y >= 0 && y < h && bin[y * w + x] === 1;
  };
  lines.forEach(function (l) {
    for (var y = Math.max(0, l.from - 4); y <= Math.min(h - 1, l.to + 4); y++) {
      eraseRuns(
        w,
        function (x) {
          return bin[y * w + x] === 1;
        },
        function (x) {
          if (dark(x, l.from - 6) || dark(x, l.to + 6)) return;
          white(x, y - 1);
          white(x, y);
          white(x, y + 1);
        },
        function (x) {
          return nearLine(vLines, x);
        },
      );
    }
  });
  /** Inside a row where this column line is not drawn (a rule written across), nothing is erased. */
  function drawnInRow(l, y) {
    for (var k = 0; k + 1 < lines.length; k++) {
      if (y > lines[k].to && y < lines[k + 1].from) {
        return vPresent(l.at, lines[k].to + 1, lines[k + 1].from - 1);
      }
    }
    return true;
  }
  vLines.forEach(function (l) {
    var drawn = [];
    for (var yy = top; yy <= bottom; yy++) drawn.push(drawnInRow(l, yy));
    for (var x = Math.max(0, l.from - 4); x <= Math.min(w - 1, l.to + 4); x++) {
      eraseRuns(
        bottom - top + 1,
        function (i) {
          return bin[(top + i) * w + x] === 1;
        },
        function (i) {
          if (!drawn[i]) return;
          white(x - 1, top + i);
          white(x, top + i);
          white(x + 1, top + i);
        },
        function (i) {
          return nearLine(lines, top + i);
        },
      );
    }
  });
  // Inside a rule row the column line is not drawn, but its ends may poke in from the row lines:
  // a short stroke at the line's position that starts at a row line and ends in white space is
  // such a stub (a letter stroke there continues into the letter instead).
  vLines.forEach(function (l) {
    for (var k = 0; k + 1 < lines.length; k++) {
      var y0 = lines[k].to + 1,
        y1 = lines[k + 1].from - 1;
      if (y1 - y0 < 8 || vPresent(l.at, y0, y1)) continue;
      for (var x = Math.max(0, l.from - 2); x <= Math.min(w - 1, l.to + 2); x++) {
        [
          [y0, 1],
          [y1, -1],
        ].forEach(function (end) {
          var y = end[0],
            n = 0;
          while (n < 30 && dark(x, y + n * end[1])) n++;
          if (n === 0 || n >= 30) return;
          var beyond = y + n * end[1];
          for (var dx = -4; dx <= 4; dx++)
            if (dark(x + dx, beyond) || dark(x + dx, beyond + end[1])) return;
          for (var m = 0; m < n; m++) white(x, y + m * end[1]);
        });
      }
    }
  });
  var cleanImg = { w: w, h: h, data: clean };
  var cleanBin = binarize(cleanImg);

  // ---- 5. columns; the service columns = the longest run of similar narrow columns ----
  var cols = [];
  for (var c = 0; c + 1 < vLines.length; c++)
    cols.push({ x0: vLines[c].to + 1, x1: vLines[c + 1].from - 1 });
  var bestRun = [0, 0];
  for (var s0 = 0; s0 < cols.length; s0++) {
    var e = s0;
    var base = cols[s0].x1 - cols[s0].x0;
    while (e + 1 < cols.length) {
      var wd = cols[e + 1].x1 - cols[e + 1].x0;
      if (wd < base * 0.65 || wd > base * 1.5) break;
      e++;
    }
    if (e - s0 > bestRun[1] - bestRun[0]) bestRun = [s0, e];
  }
  var dataFrom = bestRun[0],
    dataTo = bestRun[1];
  if (dataTo - dataFrom + 1 < 6) return null;
  var dataCols = cols.slice(dataFrom, dataTo + 1);
  // Label columns: the item column next to the service columns, the group column after it.
  var labelCols = cols.filter(function (_, i) {
    return i < dataFrom || i > dataTo;
  });
  // Reading order from the service columns outwards (item first, then group).
  labelCols.sort(function (a, b) {
    var da =
      a.x0 > dataCols[dataCols.length - 1].x1
        ? a.x0 - dataCols[dataCols.length - 1].x1
        : dataCols[0].x0 - a.x1;
    var db =
      b.x0 > dataCols[dataCols.length - 1].x1
        ? b.x0 - dataCols[dataCols.length - 1].x1
        : dataCols[0].x0 - b.x1;
    return da - db;
  });

  var rtl = labelCols[0].x0 > dataCols[0].x0;

  /**
   * A column line drawn through a row: within a few pixels of its position (a page is never
   * perfectly straight, so a line drifts across the table), one pixel column dark over at least
   * 85% of the row's middle. A letter stroke there is shorter.
   */
  function vPresent(xAt, y0, y1) {
    var from = Math.round(y0 + (y1 - y0) * 0.15),
      to = y1 - (y1 - y0) * 0.15,
      best = 0,
      t = 0;
    for (var yy0 = from; yy0 < to; yy0++) t++;
    if (!t) return false;
    for (var x = xAt - 6; x <= xAt + 6; x++) {
      if (x < 1 || x >= w - 1) continue;
      var n = 0;
      for (var yy = from; yy < to; yy++) {
        var r = yy * w;
        if (bin[r + x] || bin[r + x - 1] || bin[r + x + 1]) n++;
      }
      if (n > best) best = n;
    }
    return best / t >= 0.85;
  }

  /** A drawn line across [x0, x1]: one continuous run (a line of text has gaps between letters). */
  function hPresent(l, x0, x1) {
    var run = 0,
      best = 0,
      t = 0;
    for (var xx = Math.round(x0 + (x1 - x0) * 0.1); xx < x1 - (x1 - x0) * 0.1; xx++) {
      t++;
      var hit = false;
      for (var yy = l.from - 2; yy <= l.to + 2 && !hit; yy++) if (bin[yy * w + xx]) hit = true;
      run = hit ? run + 1 : 0;
      if (run > best) best = run;
    }
    return t > 0 && best / t >= 0.85;
  }

  /** Nearest-neighbour enlargement: single letters read better at a larger size. */
  function enlarge(im, f) {
    var W = im.w * f,
      H = im.h * f,
      out = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) {
      var sy = Math.floor(y / f) * im.w;
      for (var x = 0; x < W; x++) out[y * W + x] = im.data[sy + Math.floor(x / f)];
    }
    return { w: W, h: H, data: out, ox: im.ox, oy: im.oy };
  }

  /** Black and white by the crop's own Otsu threshold (stronger contrast for a re-read). */
  function otsuCrop(im) {
    var hist = new Array(256).fill(0);
    for (var i = 0; i < im.data.length; i++) hist[im.data[i]]++;
    var sum = 0;
    for (var t = 0; t < 256; t++) sum += t * hist[t];
    var sumB = 0,
      wB = 0,
      best = 0,
      thr = 127;
    for (var t2 = 0; t2 < 256; t2++) {
      wB += hist[t2];
      if (!wB) continue;
      var wF = im.data.length - wB;
      if (!wF) break;
      sumB += t2 * hist[t2];
      var between = wB * wF * Math.pow(sumB / wB - (sum - sumB) / wF, 2);
      if (between > best) {
        best = between;
        thr = t2;
      }
    }
    var out = new Uint8Array(im.data.length);
    for (var j = 0; j < out.length; j++) out[j] = im.data[j] > thr ? 255 : 0;
    return { w: im.w, h: im.h, data: out, ox: im.ox, oy: im.oy };
  }

  function read(x0, y0, x1, y1, opts) {
    var im = cropImg(cleanImg, x0, y0, x1, y1, 12);
    if (!im) return [];
    if (opts.otsu) im = otsuCrop(im);
    var f = opts.scale || 1;
    if (f > 1) im = enlarge(im, f);
    return ocr(im, opts).map(function (wd) {
      return {
        text: wd.text,
        x: wd.x / f + im.ox,
        y: wd.y / f + im.oy,
        w: wd.w / f,
        h: wd.h / f,
        conf: wd.conf,
      };
    });
  }

  var LETTER = /^[בכהסחנ](\/[בכהסחנ])?$/;
  var N = 24;

  /** One piece of ink normalized to N×N. */
  function shape(bx0, by0, bx1, by1) {
    var bw = bx1 - bx0 + 1,
      bh = by1 - by0 + 1,
      side = Math.max(bw, bh);
    var v = new Uint8Array(N * N);
    var ox = (side - bw) / 2,
      oy = (side - bh) / 2;
    for (var yy = by0; yy <= by1; yy++) {
      for (var xx = bx0; xx <= bx1; xx++) {
        if (!cleanBin[yy * w + xx]) continue;
        var gx = Math.min(N - 1, Math.floor(((xx - bx0 + ox) / side) * N));
        var gy = Math.min(N - 1, Math.floor(((yy - by0 + oy) / side) * N));
        v[gy * N + gx] = 1;
      }
    }
    return { v: v, aspect: bw / bh, box: [bx0, by0, bx1, by1] };
  }

  /**
   * The ink of one cell as its letters, split where blank columns separate them ("ב/ח" → ב, /, ח).
   * null: an empty cell.
   */
  function glyph(col, y0, y1) {
    var X0 = col.x0 + 2,
      X1 = col.x1 - 2,
      Y0 = y0 + 2,
      Y1 = y1 - 2;
    var proj = [],
      total = 0;
    for (var x = X0; x < X1; x++) {
      var n = 0;
      for (var y = Y0; y < Y1; y++) n += cleanBin[y * w + x];
      proj.push(n);
      total += n;
    }
    if (total < 15) return null;
    var parts = [];
    groupRuns(
      proj.map(function (n) {
        return n > 0;
      }),
    ).forEach(function (run) {
      var bx0 = X0 + run.from,
        bx1 = X0 + run.to,
        by0 = 1e9,
        by1 = -1,
        ink2 = 0;
      for (var y = Y0; y < Y1; y++) {
        for (var x = bx0; x <= bx1; x++) {
          if (!cleanBin[y * w + x]) continue;
          ink2++;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
        }
      }
      if (ink2 >= 8) parts.push(shape(bx0, by0, bx1, by1));
    });
    if (!parts.length) return null;
    var all = [1e9, 1e9, -1, -1];
    parts.forEach(function (p) {
      all[0] = Math.min(all[0], p.box[0]);
      all[1] = Math.min(all[1], p.box[1]);
      all[2] = Math.max(all[2], p.box[2]);
      all[3] = Math.max(all[3], p.box[3]);
    });
    var whole = shape(all[0], all[1], all[2], all[3]);
    // Three pieces, the middle one narrow: two letters and the slash between them.
    if (parts.length === 3 && parts[1].aspect < 0.8) {
      parts[1].slash = true;
    } else if (parts.length > 1) {
      // Specks or a letter broken in two: the cell's ink as one piece.
      parts = [whole];
    }
    // Pieces in reading order (right to left in a Hebrew table).
    if (rtl) parts.reverse();
    return { parts: parts, whole: whole };
  }

  function distance(a, b) {
    var inter = 0,
      uni = 0;
    for (var i = 0; i < a.length; i++) {
      inter += a[i] & b[i];
      uni += a[i] | b[i];
    }
    return uni ? 1 - inter / uni : 0;
  }

  var LATIN = /[A-Za-z]/;
  var HEBREW = /[א-ת]/;
  /** Specks read as text: bars, vowel points, lone punctuation. */
  var SPECK = /^[|֑-ׇ'`.,:;~_\-]+$/;
  /** A footnote marker as read: "(*1)", ")1%(", "3%(", ')"6', "(*)". */
  var MARKER = /^[()[\]*%"'°\d]{2,5}$/;
  function minConf(ws) {
    return ws.length
      ? Math.min.apply(
          null,
          ws.map(function (wd) {
            return wd.conf;
          }),
        )
      : 0;
  }
  /**
   * A text cell read word by word: a word read in English letters is read again in Hebrew only
   * (the more confident reading wins); a footnote marker is read again on its own; specks are
   * dropped. `unsure`: a word stays below 70% confidence or a marker has no number.
   */
  /**
   * The digit of a footnote marker, printed "(N*)": the digit, then a small raised asterisk (often
   * read as 7 / 9). The first digit of each reading is taken; null unless the readings agree.
   */
  function markerDigit(wd) {
    var own = wd.text.replace(/\D/g, '');
    var seen = own ? [own[0]] : [];
    [
      { psm: 8, scale: 3 },
      { psm: 7, scale: 4 },
      { psm: 8, scale: 5, otsu: true },
      { psm: 7, scale: 3, otsu: true },
    ].forEach(function (v) {
      var d = read(wd.x - 6, wd.y - 6, wd.x + wd.w + 6, wd.y + wd.h + 6, {
        psm: v.psm,
        scale: v.scale,
        otsu: v.otsu,
        whitelist: '()*0123456789',
      })
        .map(function (t) {
          return t.text;
        })
        .join('')
        .replace(/\D/g, '');
      if (d) seen.push(d[0]);
    });
    var votes = {};
    seen.forEach(function (d) {
      votes[d] = (votes[d] || 0) + 1;
    });
    var keys = Object.keys(votes);
    // One digit only, seen at least three times (the first reading counts as one).
    return keys.length === 1 && votes[keys[0]] >= 3 ? keys[0] : null;
  }

  /**
   * A text cell read twice — Hebrew and English together, and Hebrew only. In a Hebrew table a
   * word read in English letters is replaced by the Hebrew-only word at the same place, unless
   * it was read with high confidence ("EVAP", "1.6L"). A footnote marker is read again on its
   * own; specks are dropped. `unsure`: any word below 70% confidence, an English word kept with
   * low confidence, or a marker without an agreed number ("(*?)").
   */
  function readText(x0, y0, x1, y1, opts) {
    var unsure = false;
    // Invisible direction marks the engine adds are not part of the print.
    var both = read(x0, y0, x1, y1, opts).map(function (wd) {
      return {
        text: wd.text.replace(/[‎‏]/g, ''),
        x: wd.x,
        y: wd.y,
        w: wd.w,
        h: wd.h,
        conf: wd.conf,
      };
    });
    var hebOnly = null;
    var overlap = function (a, b) {
      return (
        Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > Math.min(a.w, b.w) * 0.5 &&
        Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < Math.max(a.h, b.h) * 0.6
      );
    };
    var words = both
      .map(function (wd) {
        if (MARKER.test(wd.text) && /[()]/.test(wd.text)) {
          var n = markerDigit(wd);
          if (!n) unsure = true;
          return { text: '(*' + (n || '?') + ')', x: wd.x, y: wd.y, w: wd.w, h: wd.h, conf: 90 };
        }
        // A term with a digit or a hyphen ("Ti-VCT", "1.6L") is real English: kept, and checked
        // by the owner when not read with confidence.
        var term = /[\d-]/.test(wd.text);
        if (LATIN.test(wd.text) && term && wd.conf < 85) unsure = true;
        if (LATIN.test(wd.text) && !term && wd.conf < 85) {
          if (!hebOnly)
            hebOnly = read(x0, y0, x1, y1, { psm: opts.psm, scale: opts.scale, lang: 'heb' });
          var same = hebOnly.filter(function (h) {
            return overlap(h, wd);
          });
          var ht = same
            .map(function (h) {
              return h.text;
            })
            .join(' ');
          if (same.length && HEBREW.test(ht) && !LATIN.test(ht)) {
            return { text: ht, x: wd.x, y: wd.y, w: wd.w, h: wd.h, conf: minConf(same) };
          }
          unsure = true;
        }
        return wd;
      })
      .filter(function (wd) {
        return !SPECK.test(wd.text);
      });
    if (
      words.some(function (wd) {
        return wd.conf < 70;
      })
    ) {
      unsure = true;
    }
    return { text: text(words), unsure: unsure };
  }

  // ---- 6. group column spans (merged vertically) ----
  var groupCol = labelCols.length > 1 ? labelCols[1] : null;
  var groupSpans = [];
  if (groupCol) {
    var start = 0;
    for (var li = 1; li < lines.length; li++) {
      if (li === lines.length - 1 || hPresent(lines[li], groupCol.x0, groupCol.x1)) {
        groupSpans.push({ y0: lines[start].to + 1, y1: lines[li].from - 1 });
        start = li;
      }
    }
    groupSpans.forEach(function (sp) {
      sp.text =
        ink(cleanBin, w, groupCol.x0, sp.y0, groupCol.x1, sp.y1) > 20
          ? readText(groupCol.x0, sp.y0, groupCol.x1, sp.y1, { psm: 6 }).text
          : '';
    });
  }

  // ---- 7. rows: labels, rules written across the columns, and the cells' ink ----
  var rows = [];
  var glyphs = [];
  for (var bi = 0; bi + 1 < lines.length; bi++) {
    var y0 = lines[bi].to + 1,
      y1 = lines[bi + 1].from - 1;
    if (y1 - y0 < 8) continue;
    var row = { y0: y0, y1: y1, group: '', label: [], data: [], merged: null };
    for (var gi = 0; gi < groupSpans.length; gi++) {
      var sp = groupSpans[gi];
      if (y0 >= sp.y0 - 3 && y1 <= sp.y1 + 3) row.group = sp.text;
    }
    var itemCol = labelCols[0];
    var lab =
      ink(cleanBin, w, itemCol.x0, y0, itemCol.x1, y1) > 20
        ? readText(itemCol.x0, y0, itemCol.x1, y1, { psm: 6 })
        : { text: '', unsure: false };
    row.label.push(lab.text);
    // The item name / the rule text is not proven: the owner checks the row.
    if (lab.unsure) row.textUnsure = true;
    var open = 0;
    for (var ci = 1; ci < dataCols.length; ci++) {
      if (!vPresent(vLines[dataFrom + ci].at, y0, y1)) open++;
    }
    var dx0 = dataCols[0].x0,
      dx1 = dataCols[dataCols.length - 1].x1;
    if (open >= (dataCols.length - 1) * 0.6) {
      // Merged across the service columns: a rule written as text ("החלף כל שנתיים").
      var rule = readText(dx0, y0, dx1, y1, { psm: 6, scale: 2 });
      row.merged = rule.text;
      if (rule.unsure) row.textUnsure = true;
      rows.push(row);
      continue;
    }
    row.cells = dataCols.map(function (col) {
      var gl = glyph(col, y0, y1);
      if (gl) glyphs.push(gl);
      return gl;
    });
    rows.push(row);
  }

  // ---- 8. numbers: the service intervals over the columns (header rows) ----
  // A row is a header row when its cells read as numbers.
  function readNumber(col, r) {
    var ws = read(col.x0, r.y0, col.x1, r.y1, { psm: 7, whitelist: '0123456789' });
    var t = ws
      .map(function (wd) {
        return wd.text;
      })
      .join('')
      .replace(/\D/g, '');
    var conf = ws.length
      ? Math.min.apply(
          null,
          ws.map(function (wd) {
            return wd.conf;
          }),
        )
      : 0;
    return { t: t, conf: conf };
  }
  rows.forEach(function (r) {
    if (!r.cells) return;
    var probe = -1;
    for (var k = 0; k < r.cells.length && probe < 0; k++)
      if (r.cells[k] && r.cells[k].parts.length === 1 && r.cells[k].parts[0].aspect > 1.1)
        probe = k;
    if (probe < 0) return;
    var first = readNumber(dataCols[probe], r);
    if (first.t.length < 2 || first.conf < 60) return;
    r.numbers = true;
    r.data = r.cells.map(function (c, k) {
      if (!c) return null;
      var got = k === probe ? first : readNumber(dataCols[k], r);
      return got.t || null;
    });
  });

  // ---- 9. letters: pieces that look alike are one cluster, read together (majority vote) ----
  var clusters = [];
  rows.forEach(function (r) {
    if (!r.cells || r.numbers) return;
    r.cells.forEach(function (c) {
      if (!c) return;
      c.parts.forEach(function (p) {
        if (p.slash) return;
        var best = null,
          bestD = 0.22;
        clusters.forEach(function (cl) {
          if (Math.abs(cl.aspect - p.aspect) > cl.aspect * 0.3) return;
          var d = distance(cl.rep, p.v);
          if (d < bestD) {
            bestD = d;
            best = cl;
          }
        });
        if (!best) {
          best = { rep: p.v, aspect: p.aspect, members: [] };
          clusters.push(best);
        }
        best.members.push(p);
        p.cluster = best;
      });
    });
  });
  clusters.forEach(function (cl) {
    var votes = {};
    var step = Math.max(1, Math.floor(cl.members.length / 7));
    var asked = 0;
    for (var m = 0; m < cl.members.length && asked < 7; m += step) {
      var b = cl.members[m].box;
      var ws = read(b[0] - 5, b[1] - 5, b[2] + 6, b[3] + 6, {
        psm: 10,
        whitelist: 'בכהסחנ',
        scale: 3,
      });
      var t = ws
        .map(function (wd) {
          return wd.text;
        })
        .join('')
        .replace(/\s/g, '');
      asked++;
      if (/^[בכהסחנ]$/.test(t)) votes[t] = (votes[t] || 0) + 1;
    }
    var top = null,
      topN = 0;
    for (var key in votes)
      if (votes[key] > topN) {
        top = key;
        topN = votes[key];
      }
    cl.text = top;
    cl.votes = votes;
    // Sure only when every sampled reading agrees (a cluster mixing ב and כ is never sure: its
    // cells are then read one by one).
    cl.sure = Boolean(top) && topN === asked && Object.keys(votes).length === 1;
  });
  // A letter almost as close to another letter's cluster as to its own (ב / כ are alike) is a
  // close call: it is read again on its own before it counts.
  var labeled = clusters.filter(function (cl) {
    return cl.text;
  });
  rows.forEach(function (r) {
    if (!r.cells || r.numbers) return;
    r.cells.forEach(function (c) {
      if (!c) return;
      c.parts.forEach(function (p) {
        if (p.slash || !p.cluster.text) return;
        var own = distance(p.v, p.cluster.rep),
          alt = 1;
        labeled.forEach(function (cl) {
          if (cl.text !== p.cluster.text) alt = Math.min(alt, distance(p.v, cl.rep));
        });
        p.closeCall = alt - own < 0.1;
      });
    });
  });

  // Every cell's reading from its cluster; a cell is sure only when all its letters are.
  rows.forEach(function (r) {
    if (!r.cells || r.numbers) return;
    r.cells.forEach(function (c) {
      if (!c) return;
      c.text = c.parts
        .map(function (p) {
          return p.slash ? '/' : p.cluster.text || '?';
        })
        .join('');
      c.sure =
        LETTER.test(c.text) &&
        c.parts.every(function (p) {
          return p.slash || (p.cluster.sure && !p.closeCall);
        });
    });
  });

  // An uncertain cell is read again on its own: enlarged, with and without its own black-and-
  // white threshold, as one character and as a word. A value is taken only when at least three
  // readings agree and none disagrees; otherwise the cell stays uncertain ('?'). Never guessed.
  var REREAD = [
    { psm: 10, scale: 3 },
    { psm: 10, scale: 4, otsu: true },
    { psm: 8, scale: 4 },
    { psm: 10, scale: 5, otsu: true },
    { psm: 8, scale: 3, otsu: true },
  ];
  // A combined code is read as one symbol group (single-character mode keeps its slash).
  var REREAD_COMBINED = [
    { psm: 10, scale: 3 },
    { psm: 10, scale: 4 },
    { psm: 10, scale: 5 },
    { psm: 10, scale: 3, otsu: true },
    { psm: 10, scale: 4, otsu: true },
  ];
  function reread(box, whitelist, valid, variants) {
    var votes = {};
    (variants || REREAD).forEach(function (v) {
      var ws = read(box[0] - 6, box[1] - 6, box[2] + 7, box[3] + 7, {
        psm: v.psm,
        scale: v.scale,
        otsu: v.otsu,
        whitelist: whitelist,
      });
      var t = ws
        .map(function (wd) {
          return wd.text;
        })
        .join('')
        .replace(/\s/g, '');
      if (!valid.test(t)) return;
      votes[t] = (votes[t] || 0) + 1;
    });
    var keys = Object.keys(votes);
    return keys.length === 1 && votes[keys[0]] >= 3 ? keys[0] : null;
  }
  rows.forEach(function (r) {
    if (!r.cells || r.numbers) return;
    r.cells.forEach(function (c) {
      if (!c || c.sure) return;
      var wide = c.parts.length === 1 && c.parts[0].aspect > 1.5;
      if (wide) {
        // A combined code whose slash touches a letter: read as a whole, slash included.
        var whole = reread(c.whole.box, 'בכהסחנ/', LETTER, REREAD_COMBINED);
        if (whole) {
          c.text = whole;
          c.sure = true;
        }
        return;
      }
      var texts = c.parts.map(function (p) {
        if (p.slash) return '/';
        return p.cluster.sure && !p.closeCall
          ? p.cluster.text
          : reread(p.box, 'בכהסחנ', /^[בכהסחנ]$/);
      });
      var combined =
        texts.every(Boolean) && LETTER.test(texts.join(''))
          ? texts.join('')
          : c.parts.length > 1
            ? reread(c.whole.box, 'בכהסחנ/', LETTER, REREAD_COMBINED)
            : null;
      c.text = combined || '?';
      c.sure = Boolean(combined);
    });
  });
  rows.forEach(function (r) {
    if (r.cells && !r.numbers) {
      r.unsure = [];
      r.data = r.cells.map(function (c, k) {
        if (!c) return null;
        if (!c.sure) r.unsure.push(k);
        return LETTER.test(c.text) ? c.text : '?';
      });
    }
    if (r.cells && rtl) {
      // Reading order: the first service column first (right to left for a Hebrew table).
      r.data.reverse();
      if (r.unsure)
        r.unsure = r.unsure.map(function (k) {
          return r.cells.length - 1 - k;
        });
    }
    delete r.cells;
  });

  // ---- 10. text under the table (footnotes), up to the page end ----
  var below = [];
  if (h - bottom > 40) {
    var words2 = read(0, bottom + 4, w, Math.min(h, bottom + 4 + h * 0.4), { psm: 6 });
    var bands = [];
    words2
      .slice()
      .sort(function (a, b) {
        return a.y + a.h / 2 - (b.y + b.h / 2);
      })
      .forEach(function (wd) {
        var yc = wd.y + wd.h / 2,
          last = bands[bands.length - 1];
        if (last && Math.abs(last.yc - yc) < wd.h * 0.6) last.words.push(wd);
        else bands.push({ yc: yc, words: [wd] });
      });
    below = bands.map(function (b) {
      return b.words
        .sort(function (a, c) {
          return c.x - a.x;
        })
        .map(function (wd) {
          return wd.text;
        })
        .join(' ');
    });
  }

  // Where everything is on the (straightened) page, so the app can show the owner the original
  // spot of a cell or a row next to its reading.
  var colsInOrder = dataCols.map(function (c) {
    return [c.x0, c.x1];
  });
  if (rtl) colsInOrder.reverse();
  return {
    angle: angle,
    width: w,
    height: h,
    columns: colsInOrder,
    itemColumn: [labelCols[0].x0, labelCols[0].x1],
    dataColumns: dataCols.length,
    // The service columns as they appear on the page: right to left for a Hebrew table.
    rtl: rtl,
    rows: rows,
    clusters: clusters.map(function (cl) {
      return { n: cl.members.length, text: cl.text, votes: cl.votes };
    }),
    below: below,
  };
}
