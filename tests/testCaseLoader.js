const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function findColumnIndex(headerRow, candidateHeaders) {
  const normalizedHeaderRow = headerRow.map((h) => normalizeHeader(h));
  for (const candidate of candidateHeaders) {
    const idx = normalizedHeaderRow.indexOf(normalizeHeader(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseFirstTableFromSheet(sheet) {
  // FIX: Numbers-exported Excel can have notes above the real header row; detect the header row dynamically.
  const grid = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!Array.isArray(grid) || grid.length === 0) return [];

  const idCandidates = ['id', 'testcaseid', 'testcase id', 'tcid', 'test id', 'testcase'];
  const categoryCandidates = ['category', 'module', 'section', 'scenario', 'type', 'test category'];
  const inputCandidates = ['input', 'input text', 'singlish', 'singlish input', 'source', 'from'];
  const expectedCandidates = ['expected', 'expected output', 'expectedoutput', 'output', 'sinhala', 'translation', 'to'];

  let bestHeaderRowIndex = -1;
  let bestScore = -1;
  const scanLimit = Math.min(grid.length, 50);

  for (let i = 0; i < scanLimit; i++) {
    const row = Array.isArray(grid[i]) ? grid[i] : [];
    const score =
      (findColumnIndex(row, idCandidates) !== -1 ? 1 : 0) +
      (findColumnIndex(row, inputCandidates) !== -1 ? 1 : 0) +
      (findColumnIndex(row, expectedCandidates) !== -1 ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestHeaderRowIndex = i;
    }
  }

  if (bestHeaderRowIndex === -1 || bestScore < 2) return [];

  const headerRow = grid[bestHeaderRowIndex].map((v) => String(v ?? '').trim());
  const idIndex = findColumnIndex(headerRow, idCandidates);
  const categoryIndex = findColumnIndex(headerRow, categoryCandidates);
  const inputIndex = findColumnIndex(headerRow, inputCandidates);
  const expectedIndex = findColumnIndex(headerRow, expectedCandidates);

  if (inputIndex === -1 || expectedIndex === -1) return [];

  const cases = [];
  for (let r = bestHeaderRowIndex + 1; r < grid.length; r++) {
    const row = Array.isArray(grid[r]) ? grid[r] : [];
    const input = String(row[inputIndex] ?? '').trim();
    const expected = String(row[expectedIndex] ?? '').trim();
    if (!input || !expected) continue;

    const idRaw = idIndex !== -1 ? row[idIndex] : `Row_${r + 1}`;
    const categoryRaw = categoryIndex !== -1 ? row[categoryIndex] : 'From_Excel';

    cases.push({
      id: String(idRaw ?? '').trim() || `Row_${r + 1}`,
      category: String(categoryRaw ?? '').trim() || 'From_Excel',
      input,
      expected
    });
  }

  return cases;
}

function loadTestCasesFromXlsx(xlsxPath) {
  // FIX: Load test cases from the provided Excel file instead of hardcoding them.
  const absolutePath = path.isAbsolute(xlsxPath) ? xlsxPath : path.resolve(process.cwd(), xlsxPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Excel file not found: ${absolutePath}`);
  }

  const workbook = xlsx.readFile(absolutePath);
  const sheetNames = workbook.SheetNames ?? [];
  if (sheetNames.length === 0) throw new Error(`No sheets found in Excel file: ${absolutePath}`);

  // FIX: Prefer the sheet that actually contains the test case table (skip export/instruction sheets).
  const candidateSheetNames = sheetNames.filter((name) => {
    const n = normalizeHeader(name);
    return !n.includes('exportsummary') && !n.includes('howto') && !n.includes('columnd');
  });

  const sheetsToTry = candidateSheetNames.length > 0 ? candidateSheetNames : sheetNames;
  let best = [];
  for (const name of sheetsToTry) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const cases = parseFirstTableFromSheet(sheet);
    if (cases.length > best.length) best = cases;
  }

  return best;
}

module.exports = { loadTestCasesFromXlsx };
