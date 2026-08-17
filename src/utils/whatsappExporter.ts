import type { GroceryList, ListItem, Category } from '../types/database';

export function formatWhatsAppMessage(
  list: GroceryList,
  items: ListItem[],
  categories: Category[]
): string {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  // Group items by category
  const grouped = new Map<string, ListItem[]>();
  for (const item of items) {
    const catName = (item.catalogItemId ? catMap.get(item.catalogItemId) : null) || 'Staples & Misc';
    const listArr = grouped.get(catName) || [];
    listArr.push(item);
    grouped.set(catName, listArr);
  }

  const estimatedTotal = items.reduce((sum, i) => sum + (i.estimatedPrice || 0) * i.quantity, 0);

  let text = `🛒 *${list.title}*\n`;
  text += `📅 Month: ${list.listMonth}\n`;
  text += `📦 Total Items: ${items.length}`;
  if (estimatedTotal > 0) {
    text += ` | Est. Budget: ₹${estimatedTotal.toLocaleString('en-IN')}`;
  }
  text += `\n-----------------------------\n\n`;

  for (const [catName, catItems] of grouped.entries()) {
    text += `*${catName.toUpperCase()}*\n`;
    for (const item of catItems) {
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
