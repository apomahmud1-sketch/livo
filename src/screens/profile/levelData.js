// Livo — Profile (Me) data, copied from the web preview (livo-home-preview).
// Every number, price and label below matches the preview exactly.
// Mid-table level values (Lv11-19, 21-29, 31-39, 41-49) are samples in the
// preview too — the real values come from the mother panel later.
// VIP4 (600,000) and VIP5 (1,200,000) prices are also preview samples.

export const PROFILE = {
  name: 'Mr.lee',
  id: '9065858',
  country: 'Singapore',
  age: 30,
  language: 'English',
  secondLanguage: 'Chinese Simplified',
  friends: 1,
  following: 1,
  fans: 2,
  signature: 'This user is too lazy to set up a personalized signature yet',
  chatPrice: 1200,
  level: 2,
  levelPoints: 39200,
  // Lv2 threshold 30,000 -> Lv3 threshold 100,000; (39200-30000)/(100000-30000) = 13%
  levelProgress: 13,
  levelTopUpToGo: 60800,
};

export const LEVEL_RULE_MALE =
  'The level is based on historical top-up or consumption, taking the maximum of top-up or consumption. Consumption includes gift sending, video call spending, and group packet spending.';

export const LEVEL_RULE_FEMALE =
  'The level is based on monthly received beans, taking the maximum of this month or last month.';

export const LEVEL_NOTE_LOW_BALANCE =
  'When your balance is ≤ 2000 diamonds, Level will become Lv0.';

// Lv0-Lv50 thresholds. Anchors from the reference photo are exact;
// in-between values are preview samples.
export const LV_ROWS = [
  [0, '0'], [1, '10,000'], [2, '30,000'], [3, '100,000'], [4, '300,000'],
  [5, '1,000,000'], [6, '3,000,000'], [7, '10,000,000'], [8, '30,000,000'],
  [9, '100,000,000'], [10, '300,000,000'], [11, '340,000,000'], [12, '380,000,000'],
  [13, '430,000,000'], [14, '490,000,000'], [15, '550,000,000'], [16, '620,000,000'],
  [17, '700,000,000'], [18, '790,000,000'], [19, '890,000,000'], [20, '1,000,000,000'],
  [21, '1,100,000,000'], [22, '1,250,000,000'], [23, '1,400,000,000'], [24, '1,550,000,000'],
  [25, '1,750,000,000'], [26, '1,950,000,000'], [27, '2,200,000,000'], [28, '2,450,000,000'],
  [29, '2,700,000,000'], [30, '3,000,000,000'], [31, '3,400,000,000'], [32, '3,800,000,000'],
  [33, '4,300,000,000'], [34, '4,900,000,000'], [35, '5,500,000,000'], [36, '6,200,000,000'],
  [37, '7,000,000,000'], [38, '7,900,000,000'], [39, '8,900,000,000'], [40, '10,000,000,000'],
  [41, '11,000,000,000'], [42, '12,500,000,000'], [43, '14,000,000,000'], [44, '15,500,000,000'],
  [45, '17,500,000,000'], [46, '19,500,000,000'], [47, '22,000,000,000'], [48, '24,500,000,000'],
  [49, '27,000,000,000'], [50, '30,000,000,000'],
];

// `unlock` = the level at which the privilege opens. `icon` is an emoji
// (the preview used inline SVG; emoji keeps the same meaning in-app).
export const LV_PRIVS_MALE = [
  { t: 'Entry Bar', d: 'There will be a striking bar when you enter a room.', icon: '✨', bg: '#efe9fd', fg: '#7c3aed', unlock: 1 },
  { t: 'Portrait Frame', d: 'Show your noble status everywhere.', icon: '👑', bg: '#fde7f1', fg: '#db2777', unlock: 2 },
  { t: 'Privilege Sticker', d: 'Exclusive amazing stickers for high level users!', icon: '😊', bg: '#e0f2fe', fg: '#0284c7', unlock: 3 },
  { t: 'Privilege Gift', d: 'Give your exclusive luxury gifts to the girls!', icon: '🎁', bg: '#fef3c7', fg: '#d97706', unlock: 4 },
  { t: 'Entrance Effect', d: 'Enter the room with exclusive effect.', icon: '🚗', bg: '#e0e7ff', fg: '#4f46e5', unlock: 5 },
  { t: 'Privilege Party Room Background', d: 'Let your Party room looks distinguished!', icon: '🖼️', bg: '#dcfce7', fg: '#16a34a', unlock: 6 },
  { t: 'Chat Bubble Privilege', d: 'Make your messages easier to see with a more visible chat bubble.', icon: '💬', bg: '#fae8ff', fg: '#a21caf', unlock: 7 },
  { t: 'Exclusive Customer Service', d: 'Exclusive WhatsApp customer service, sincere service for you', icon: '🎧', bg: '#ffedd5', fg: '#ea580c', unlock: 8 },
];

export const LV_PRIVS_FEMALE = [
  { t: 'Entry Bar', d: 'There will be a striking bar when you enter a room.', icon: '✨', bg: '#ffedd5', fg: '#ea580c', unlock: 1 },
  { t: 'Portrait Frame', d: 'Show your noble status everywhere.', icon: '👑', bg: '#ffe4d6', fg: '#c2410c', unlock: 2 },
  { t: 'Privilege Sticker', d: 'Exclusive amazing stickers for high level users!', icon: '😊', bg: '#fef3c7', fg: '#d97706', unlock: 3 },
  { t: 'Mass Messages Privilege', d: 'Send massive messages with online users to get more phone calls', icon: '💬', bg: '#f1eafd', fg: '#7c3aed', unlock: 4 },
  { t: 'Party Room Privilege', d: 'Open the Party room to have real-time video/voice chat with guests', icon: '👥', bg: '#fae8ff', fg: '#a21caf', unlock: 5 },
  { t: 'Privilege Party Room Background', d: 'Let your Party room looks distinguished!', icon: '🖼️', bg: '#dcfce7', fg: '#16a34a', unlock: 6 },
];

export const VIP_TIERS = [
  { name: 'VIP1', title: 'Baron', price: 60000, color: '#a5713a', grad: ['#7c4a1e', '#bd8a48'] },
  { name: 'VIP2', title: 'Earl', price: 120000, color: '#1f9d63', grad: ['#14713f', '#27ba7c'] },
  { name: 'VIP3', title: 'Marquis', price: 300000, color: '#2f7fe0', grad: ['#1c56c4', '#409cf2'] },
  // VIP4 / VIP5 prices are preview samples — real values come from the panel.
  { name: 'VIP4', title: 'Duke', price: 600000, color: '#8b5cf6', grad: ['#5f27c9', '#9a6cf5'] },
  { name: 'VIP5', title: 'King', price: 1200000, color: '#e04545', grad: ['#a91f1f', '#f26060'] },
];

export const VIP_IDENT = [
  { key: 'bubble', t: 'Exclusive Bubble', unlock: 1, icon: '💬', note: 'You will have different exclusive speech bubble when you are on different VIP level' },
  { key: 'entrance', t: 'Entrance Effect', unlock: 2, icon: '✨', note: 'Every VIP level enters the room with its own shining entrance bar.' },
  { key: 'headwear', t: 'Exclusive Headwear', unlock: 3, icon: '👑', note: 'Each VIP level wears a different exclusive headwear frame.' },
  { key: 'cards', t: 'Room Display Cards', unlock: 3, icon: '🖼️', note: 'Your own room display card on every VIP level.' },
  { key: 'wave', t: 'Mic Sound Wave', unlock: 4, icon: '🎙️', note: 'Your mic shows a special sound wave in live rooms.' },
  { key: 'nickname', t: 'Nickname Magnified', unlock: 5, icon: '🔍', note: 'Your nickname appears bigger in live rooms.' },
];

export const VIP_PRIV = [
  { key: 'gift', t: 'VIP Gift', unlock: 1, icon: '🎁', note: 'A special gift for VIP members.' },
  { key: 'badgeslots', t: 'Badge Slots Added', unlock: 2, icon: '🏅', note: 'VIP members get extra badge slots — wear more badges on your profile at the same time.' },
  { key: 'seat', t: 'VIP Seat', unlock: 3, icon: '💺', note: 'A golden VIP seat is always reserved for you in every party room.' },
  { key: 'antikick', t: 'Anti Kick', unlock: 4, icon: '🛡️', note: 'While your VIP is active, no host or admin can kick you out of a live or party room.' },
  { key: 'antimute', t: 'Anti Mute', unlock: 5, icon: '🔊', note: 'While your VIP is active, no one can mute your mic in a live or party room.' },
];

// Diamonds -> Beans exchange options (preview EX_OPTS).
export const EX_OPTS = [
  { d: 5500, b: 10000 }, { d: 16500, b: 30000 }, { d: 55000, b: 100000 },
  { d: 165000, b: 300000 }, { d: 550000, b: 1000000 },
];

// Beans -> USD withdraw options (preview WD_OPTS). $10 = 100,000 Beans.
export const WD_OPTS = [
  { label: '$10', usd: 10, b: 100000 }, { label: '$30', usd: 30, b: 300000 },
  { label: '$50', usd: 50, b: 500000 }, { label: '$100', usd: 100, b: 1000000 },
  { label: '$200', usd: 200, b: 2000000 }, { label: '$500', usd: 500, b: 5000000 },
  { label: '$800', usd: 800, b: 8000000 }, { label: '$1600', usd: 1600, b: 16000000 },
];

export const BEANS_PER_USD = 10000;

export const PRICE_OPTS = [300, 600, 900, 1200, 1800, 2400, 3000];

export const HIGHEST_CALL_PRICE = [
  { level: '≤ Lv4', price: '3,000' },
  { level: 'Lv5', price: '3,600' },
  { level: 'Lv6', price: '4,800' },
  { level: 'Lv7', price: '6,000' },
  { level: 'Lv8', price: '9,000' },
  { level: '≥ Lv9', price: '12,000' },
];

export const BADGES_ACTIVITY = [
  { n: 'Autumn Harvest', p: 'পেয়ে গেছো', got: true, icon: '🍂', bg: '#ffedd5', fg: '#ea580c', d: 'Autumn Harvest ইভেন্টে অংশ নিয়ে এই Activity Medal পাওয়া গেছে। প্রোফাইলে সবার উপরে দেখায়।' },
  { n: 'Daily Star', p: 'আজকেরটা বাকি', got: false, icon: '⭐', bg: '#fef3c7', fg: '#d97706', d: 'প্রতিদিন লাইভে গিয়ে বা গিফট পাঠিয়ে Daily Star জমাও — 7 দিন পর পর Medal পাবে।' },
  { n: 'Active Star 300', p: '212 / 300', got: false, icon: '⚡', bg: '#e0f2fe', fg: '#0284c7', d: 'মোট 300 বার অ্যাক্টিভ থাকলে (লাইভ, কল, গিফট) Active Star 300 Badge খুলবে। এখন 212 হয়েছে।' },
];

export const BADGES_ACH = [
  { n: 'Gem Kitty', p: 'পেয়ে গেছো', got: true, icon: '🐱', bg: '#fde7f1', fg: '#db2777', d: 'Gem Kitty গিফট সিরিজ শেষ করে এই Achievement Badge পাওয়া গেছে।' },
  { n: 'King of Calls', p: '48 / 100 কল', got: false, icon: '👑', bg: '#f1eafd', fg: '#7c3aed', d: 'মোট 100টা ভিডিও কল শেষ করলে King of Calls Badge খুলবে। এখন 48টা হয়েছে।' },
  { n: 'Gift Collector', p: '17 / 30 গিফট', got: false, icon: '🎁', bg: '#dcfce7', fg: '#16a34a', d: '30 রকমের আলাদা গিফট সংগ্রহ করলে Gift Collector Badge খুলবে। এখন 17 রকম হয়েছে।' },
];

// The 3 medals shown on the My Profile Badge card.
export const PROFILE_MEDALS = ['Autumn Harvest', 'Gem Kitty', 'Active Star 300'];

export const LANGUAGES = [
  ['English', 'English'], ['Bengali', 'বাংলা'], ['Chinese Simplified', '简体中文'],
  ['Chinese Traditional', '繁體中文'], ['Hindi', 'हिन्दी'], ['Urdu', 'اردو'],
  ['Arabic', 'العربية'], ['Spanish', 'Español'], ['French', 'Français'],
  ['German', 'Deutsch'], ['Italian', 'Italiano'], ['Portuguese', 'Português'],
  ['Russian', 'Русский'], ['Japanese', '日本語'], ['Korean', '한국어'],
  ['Thai', 'ไทย'], ['Vietnamese', 'Tiếng Việt'], ['Indonesian', 'Bahasa Indonesia'],
  ['Malay', 'Bahasa Melayu'], ['Filipino', 'Filipino'], ['Turkish', 'Türkçe'],
  ['Tamil', 'தமிழ்'], ['Telugu', 'తెలుగు'], ['Punjabi', 'ਪੰਜਾਬੀ'],
  ['Nepali', 'नेपाली'], ['Sinhala', 'සිංහල'], ['Burmese', 'မြန်မာ'],
  ['Khmer', 'ខ្មែរ'], ['Dutch', 'Nederlands'], ['Polish', 'Polski'],
];

// Demo daily tasks (preview TASKS) — real tasks come from the panel later.
export const TASKS = [
  { icon: '🔑', bg: '#f1eafd', title: 'প্রতিদিন লগইন করো', sub: 'আজকের লগইন টাস্ক', reward: 50 },
  { icon: '👁️', bg: '#fdf0d5', title: '১০ মিনিট লাইভ দেখো', sub: 'অগ্রগতি: 0 / 10 মিনিট', reward: 100 },
  { icon: '➕', bg: '#fde7f1', title: 'একজন হোস্টকে Follow করো', sub: 'যেকোনো লাইভ রুম থেকে', reward: 80 },
  { icon: '🎁', bg: '#e0f5fa', title: 'একটা গিফট পাঠাও', sub: 'যেকোনো হোস্টকে পাঠালেই হবে', reward: 150 },
  { icon: '👤', bg: '#e2f5ec', title: 'প্রোফাইল সম্পূর্ণ করো', sub: 'ছবি, নাম আর ভাষা যোগ করো', reward: 200 },
  { icon: '✉️', bg: '#f1eafd', title: 'একজন বন্ধুকে আমন্ত্রণ জানাও', sub: 'বন্ধু অ্যাপে যোগ দিলেই পাবে', reward: 500 },
];
