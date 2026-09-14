'use strict';
// Smallest checks that fail if the parsing/rendering logic breaks. Run: npm test
const assert = require('assert');
const { parseCsv, toCsv, normalizePhone, cleanName, render } = require('./lib/util');

const csv = 'title,phone,about\n"Paint, Wala","+92 312 7592991","multi\nline ""quoted"""\nSolo,0300-1234567,\n';
const rows = parseCsv(csv);
assert.strictEqual(rows.length, 2);
assert.strictEqual(rows[0].title, 'Paint, Wala');
assert.strictEqual(rows[0].about, 'multi\nline "quoted"');
assert.strictEqual(rows[1].phone, '0300-1234567');
assert.strictEqual(parseCsv(toCsv(rows, ['title', 'phone', 'about']))[0].about, rows[0].about);

assert.strictEqual(normalizePhone('+92 312 7592991'), '923127592991');
assert.strictEqual(normalizePhone('0300-1234567', '92'), '923001234567');
assert.strictEqual(normalizePhone('(212) 555-1234', '1'), '12125551234');
assert.strictEqual(normalizePhone('0044 20 7946 0958', '92'), '442079460958');
assert.strictEqual(normalizePhone('', '92'), '');

assert.strictEqual(cleanName('YS Painters - Exterior & Interior'), 'YS Painters');
assert.strictEqual(cleanName('Sharry paint service 🫟'), 'Sharry paint service');
assert.strictEqual(render('Hi {name}, {category} in {location}', { name: 'A', category: 'Painter', location: 'Lahore' }), 'Hi A, Painter in Lahore');
console.log('all checks passed');
