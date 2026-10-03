/**
 * CSV parser đơn giản cho data/menu.csv (theo DATA.md):
 * hỗ trợ header, dấu phẩy và dấu nháy kép "" trong field được đặt trong "...".
 * Chạy được trong trình duyệt (window.KFCCsv) và Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KFCCsv = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Tách một dòng CSV thành các token, tôn trọng chuỗi trong dấu nháy kép */
  function parseCSVLine(line) {
    var result = [];
    var token = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { token += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(token);
        token = '';
      } else {
        token += ch;
      }
    }
    result.push(token);
    return result;
  }

  /**
   * Parse nội dung CSV -> mảng product.
   * price -> number, featured -> boolean. Dòng thiếu cột bị bỏ qua.
   */
  function parseCSV(text) {
    if (typeof text !== 'string') return [];
    var lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    var headers = parseCSVLine(lines[0]).map(function (h) { return h.trim(); });
    var products = [];

    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var values = parseCSVLine(line);
      if (values.length < headers.length) continue;

      var product = {};
      headers.forEach(function (header, index) {
        var val = values[index] ? values[index].trim() : '';
        if (header === 'price' || header === 'discount') val = parseFloat(val) || 0;
        else if (header === 'featured') val = val.toLowerCase() === 'true';
        product[header] = val;
      });
      products.push(product);
    }
    return products;
  }

  return { parseCSV: parseCSV, parseCSVLine: parseCSVLine };
});
