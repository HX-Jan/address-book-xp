import ExcelJS from 'exceljs';
import { ContactError, methodLabels, readContact } from './contact-domain.js';

export const workbookType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const methodTypes = Object.keys(methodLabels);

function columnCount(contacts, type) {
  return contacts.reduce((largest, contact) => {
    const count = contact.methods.filter((method) => method.type === type).length;
    return Math.max(largest, count);
  }, 1);
}

export async function exportWorkbook(contacts) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('联系人', { views: [{ state: 'frozen', ySplit: 1 }] });
  const methodColumns = methodTypes.flatMap((type) => {
    const count = columnCount(contacts, type);
    return Array.from({ length: count }, (_, index) => ({
      type,
      index,
      header: count === 1 ? methodLabels[type] : `${methodLabels[type]} ${index + 1}`,
      width: type === 'address' ? 36 : 24,
    }));
  });

  sheet.columns = [{ header: '姓名', width: 20 }, { header: '收藏', width: 10 }, ...methodColumns];
  sheet.getRow(1).font = { bold: true };

  for (const contact of contacts) {
    const values = Object.groupBy(contact.methods, (method) => method.type);
    const methods = methodColumns.map(({ type, index }) => values[type]?.[index]?.value ?? '');
    sheet.addRow([contact.name, contact.favorite ? '是' : '否', ...methods]);
  }

  return await workbook.xlsx.writeBuffer();
}

function readCell(row, column) {
  if (!column) return '';

  const cell = row.getCell(column);
  if (cell.type === ExcelJS.ValueType.Formula || cell.type === ExcelJS.ValueType.Error) {
    throw new ContactError(`第 ${row.number} 行有公式或错误单元格，请改为文本。`);
  }

  return cell.text.trim();
}

export async function readWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    if (!(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer)) || buffer.byteLength === 0) {
      throw new Error('Empty upload');
    }
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ContactError('无法读取此文件，请选择有效的 .xlsx 表格。');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount > 5001 || sheet.columnCount > 150) {
    throw new ContactError('请使用最多 5,000 位联系人的 Excel 表格。');
  }

  let nameColumn;
  let favoriteColumn;
  const methodColumns = [];
  sheet.getRow(1).eachCell((cell, column) => {
    const header = cell.text.trim();
    if (header === '姓名') nameColumn = column;
    if (header === '收藏') favoriteColumn = column;
    const type = methodTypes.find((key) => {
      const label = methodLabels[key];
      return new RegExp(`^${label}(?:\\s*[1-9]\\d*)?$`).test(header);
    });
    if (type) methodColumns.push({ column, type });
  });

  if (!nameColumn) throw new ContactError('第一行需要包含「姓名」列。');

  const contacts = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;

    const name = readCell(row, nameColumn);
    const favorite = readCell(row, favoriteColumn);
    const methods = methodColumns.map(({ column, type }) => ({ type, value: readCell(row, column) }));
    const populated = methods.filter(({ value }) => value);
    if (!name && !favorite && !populated.length) return;

    try {
      contacts.push(readContact({ name, favorite: /^(是|true|1)$/i.test(favorite), methods: populated }));
    } catch (error) {
      throw new ContactError(`第 ${number} 行：${error.message}`);
    }
  });

  return contacts;
}
