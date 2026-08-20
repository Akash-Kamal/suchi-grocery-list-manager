import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { GroceryList, ListItem, Category } from '../types/database';
import { groupListItemsByCategory } from './listReview';

export type PageSizeFormat = 'A4' | 'A5';

// Sanitizes text for pdf-lib StandardFonts.Helvetica (WinAnsi character set)
function cleanText(str: string | null | undefined, fallback: string = 'Item'): string {
  if (!str) return fallback;
  const cleaned = str
    .replace(/₹/g, 'Rs. ')
    .replace(/[^\x20-\x7E]/g, '') // Keep standard printable ASCII range (32-126)
    .trim();
  return cleaned || fallback;
}

export async function generateGroceryPDF(
  list: GroceryList,
  items: ListItem[],
  categories: Category[],
  pageSize: PageSizeFormat = 'A4'
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // Page dimensions in points (1 in = 72 pt)
  // A4: 595.28 x 841.89 pt
  // A5: 419.53 x 595.28 pt
  const pageWidth = pageSize === 'A4' ? 595.28 : 419.53;
  const pageHeight = pageSize === 'A4' ? 841.89 : 595.28;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const groups = groupListItemsByCategory(items, categories);

  let y = pageHeight - 50;

  // Header Banner
  page.drawRectangle({
    x: 35,
    y: y - 45,
    width: pageWidth - 70,
    height: 55,
    color: rgb(0.02, 0.45, 0.33), // Emerald dark
  });

  page.drawText('SOOCHI GROCERY LIST', {
    x: 48,
    y: y - 22,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  const listTitleClean = cleanText(list.title, 'Grocery List');
  const listMonthClean = cleanText(list.listMonth, '2026');

  page.drawText(`${listTitleClean} (${listMonthClean})`, {
    x: 48,
    y: y - 38,
    size: 10,
    font: fontRegular,
    color: rgb(0.8, 0.95, 0.9),
  });

  y -= 65;

  // Overview stats bar
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  const estimatedTotal = items.reduce((sum, i) => sum + (i.estimatedPrice || 0) * i.quantity, 0);

  page.drawText(`Total Items: ${items.length} distinct (${totalQty} qty)`, {
    x: 35,
    y: y - 10,
    size: 9,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });

  if (estimatedTotal > 0) {
    page.drawText(`Est. Budget: Rs. ${estimatedTotal.toLocaleString('en-IN')}`, {
      x: pageWidth - 180,
      y: y - 10,
      size: 9,
      font: fontBold,
      color: rgb(0.02, 0.45, 0.33),
    });
  }

  y -= 25;

  // Horizontal divider
  page.drawLine({
    start: { x: 35, y },
    end: { x: pageWidth - 35, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });

  y -= 20;

  // Draw Items Grouped by Category
  for (const group of groups) {
    // Page overflow check
    if (y < 60) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - 50;
    }

    // Category Section Header
    page.drawRectangle({
      x: 35,
      y: y - 16,
      width: pageWidth - 70,
      height: 20,
      color: rgb(0.93, 0.96, 0.94),
    });

    page.drawText(cleanText(group.categoryName, 'STAPLES').toUpperCase(), {
      x: 42,
      y: y - 12,
      size: 9,
      font: fontBold,
      color: rgb(0.02, 0.45, 0.33),
    });

    y -= 26;

    for (const item of group.items) {
      if (y < 50) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - 50;
      }

      // Checkbox Glyph [ ] or [X]
      const checkGlyph = item.isPurchased ? '[X]' : '[  ]';
      page.drawText(checkGlyph, {
        x: 42,
        y,
        size: 9,
        font: fontBold,
        color: item.isPurchased ? rgb(0.02, 0.45, 0.33) : rgb(0.5, 0.5, 0.5),
      });

      // Item Name (Sanitized for Helvetica PDF font)
      const itemNameClean = cleanText(item.itemNameSnapshot, 'Grocery Item');
      page.drawText(itemNameClean, {
        x: 65,
        y,
        size: 9,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1),
      });

      // Quantity & Unit
      const unitClean = cleanText(item.unit, 'pack');
      const qtyText = `${item.quantity} ${unitClean}`;
      page.drawText(qtyText, {
        x: pageWidth - 140,
        y,
        size: 9,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
      });

      // Note if exists
      if (item.note) {
        const noteClean = cleanText(item.note, '');
        if (noteClean) {
          y -= 11;
          page.drawText(`Note: ${noteClean}`, {
            x: 65,
            y,
            size: 7.5,
            font: fontRegular,
            color: rgb(0.4, 0.4, 0.4),
          });
        }
      }

      y -= 16;
    }

    y -= 10;
  }

  // Footer Branding
  page.drawText('Generated via SOOCHI Offline Smart Grocery Manager', {
    x: 35,
    y: 20,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.6, 0.6, 0.6),
  });

  return pdfDoc.save();
}

export async function downloadGroceryPDF(
  list: GroceryList,
  items: ListItem[],
  categories: Category[],
  pageSize: PageSizeFormat = 'A4'
): Promise<void> {
  const pdfBytes = await generateGroceryPDF(list, items, categories, pageSize);
  const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

  const sanitizedTitle = list.title.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `${sanitizedTitle || 'Grocery_List'}_${pageSize}.pdf`;

  // Always trigger direct browser file download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up Object URL after short delay
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 2000);
}
