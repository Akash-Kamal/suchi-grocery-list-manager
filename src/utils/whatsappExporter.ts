import type { GroceryList, ListItem, Category } from '../types/database';
import { groupListItemsByCategory } from './listReview';

export function formatWhatsAppMessage(
  list: GroceryList,
  items: ListItem[],
  categories: Category[]
): string {
  const groups = groupListItemsByCategory(items, categories);

  const estimatedTotal = items.reduce(
    (sum, i) =>
      sum +
      (typeof i.estimatedPrice === 'number' &&
      !isNaN(i.estimatedPrice) &&
      isFinite(i.estimatedPrice) &&
      i.estimatedPrice > 0
        ? i.estimatedPrice * (i.quantity > 0 ? i.quantity : 1)
        : 0),
    0
  );

  let text = `🛒 *${list.title}*\n`;
  if (list.listMonth) {
    text += `📅 Month: ${list.listMonth}\n`;
  }
  text += `📦 Total Items: ${items.length}`;
  if (estimatedTotal > 0) {
    text += ` | Est. Budget: ₹${estimatedTotal.toLocaleString('en-IN')}`;
  }
  text += `\n-----------------------------\n\n`;

  for (const group of groups) {
    text += `*${group.categoryName.toUpperCase()}*\n`;
    for (const item of group.items) {
      const isCheck = item.isPurchased ? '✅' : '☐';
      text += `${isCheck} ${item.itemNameSnapshot} — ${item.quantity} ${item.unit}`;
      if (item.note) {
        text += ` _(${item.note})_`;
      }
      text += `\n`;
    }
    text += `\n`;
  }

  text += `_Generated via SOOCHI Smart Offline Grocery Manager_`;

  return text;
}

export function shareToWhatsApp(list: GroceryList, items: ListItem[], categories: Category[]): void {
  const message = formatWhatsAppMessage(list, items, categories);
  const encoded = encodeURIComponent(message);
  
  if (navigator.share) {
    navigator.share({
      title: list.title,
      text: message,
    }).catch(() => {
      // Fallback to wa.me URL
      window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    });
  } else {
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  }
}
