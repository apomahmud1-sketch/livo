// Livo — Profile (Me) screen, rebuilt from the web preview (livo-home-preview).
// Me top (Mr.lee, ID 9065858, Singapore, male 30, English, check-in, dark mode,
// 1 Friend / 1 Follow / 2 Fans, My Wallet + My Income cards) and every
// sub-view: Earn beans, Exchange, Withdraw, My chat Price, My Profile detail,
// Badge, Gift received, Edit Profile, Second Language, My Invitation,
// My Tasks, Settings, My Level and VIP Member Centre.
//
// Balances: the Wallet card shows the LIVE store Diamonds balance (shared
// with WalletScreen via useApp), not a fixed number — the preview's 65 was
// the balance at that moment. Beans are local here (store.js has no beans
// field yet); they start at 0, like the preview.
// Spending Diamonds (Exchange / VIP) goes through the store's buyDiamonds
// with a negative amount, because store.js exposes no deduct function and
// this file must not change store.js. A proper deductDiamonds in store.js
// would be cleaner later.
import React from 'react';
import * as Clipboard from 'expo-clipboard';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../config';
import { useApp } from '../store';
import LevelView from './profile/LevelView';
import VipView from './profile/VipView';
import {
  BADGES_ACH, BADGES_ACTIVITY, BEANS_PER_USD, EX_OPTS, HIGHEST_CALL_PRICE,
  LANGUAGES, PRICE_OPTS, PROFILE, PROFILE_MEDALS, TASKS, WD_OPTS,
} from './profile/levelData';

const AVATAR = require('../../assets/host-arif.jpg');

function themeFor(dark) {
  return dark
    ? { bg: '#111827', surface: '#1f2937', surface2: '#374151', text: '#f9fafb', muted: '#9ca3af', border: '#374151', cardBg: '#1f2937' }
    : { bg: '#f5f3ff', surface: '#ffffff', surface2: '#f3f4f6', text: '#111827', muted: '#6b7280', border: '#e5e7eb', cardBg: '#ffffff' };
}

export default function ProfileScreen({ navigation }) {
  const { diamonds, buyDiamonds, recharge, showToast } = useApp();
  const [view, setView] = React.useState('main');
  const [dark, setDark] = React.useState(false);
  const [checkedIn, setCheckedIn] = React.useState(false);
  const [gender, setGender] = React.useState('male');
  const [beans, setBeans] = React.useState(0);
  const [earnTab, setEarnTab] = React.useState('Video income');
  const [exSel, setExSel] = React.useState(-1);
  const [wdSel, setWdSel] = React.useState(-1);
  const [chatPrice, setChatPrice] = React.useState(PROFILE.chatPrice);
  const [priceEditing, setPriceEditing] = React.useState(false);
  const [secondLang, setSecondLang] = React.useState(PROFILE.secondLanguage);
  const [vipOwned, setVipOwned] = React.useState(-1);
  const [vipDaysLeft, setVipDaysLeft] = React.useState(0);
  const [tasksDone, setTasksDone] = React.useState({});
  const [tasksEarned, setTasksEarned] = React.useState(0);
  const [badgeDetail, setBadgeDetail] = React.useState(null);
  const t = themeFor(dark);

  // Spend Diamonds through the store (see header comment). Returns false
  // when the balance is too low. The buyDiamonds toast is overridden by
  // the caller's own showToast right after.
  const spendDiamonds = (amount) => {
    if (diamonds < amount) return false;
    buyDiamonds({ diamonds: -amount });
    return true;
  };

  const copyId = async () => {
    try { await Clipboard.setStringAsync(PROFILE.id); } catch (e) { /* clipboard unavailable */ }
    showToast(`ID কপি হয়েছে: ${PROFILE.id}`);
  };

  const checkIn = () => {
    if (checkedIn) { showToast('আজকের চেক-ইন হয়ে গেছে — কাল আবার এসো'); return; }
    setCheckedIn(true);
    showToast('চেক-ইন হয়েছে! আজকের রিওয়ার্ড পেয়ে গেছো');
  };

  const toggleDark = () => {
    setDark((d) => !d);
    showToast(!dark ? 'ডার্ক মোড চালু হয়েছে' : 'ডার্ক মোড বন্ধ হয়েছে');
  };

  const goWallet = () => navigation.navigate('WalletTab');

  const parentOf = { badge: 'profile', gift: 'profile', edit: 'profile', lang: 'edit', chatprice: 'earn', exchange: 'earn', withdraw: 'earn' };
  const goBack = () => setView(parentOf[view] || 'main');

  const doExchange = () => {
    if (exSel < 0) { showToast('আগে একটা Exchange অপশন বেছে নাও'); return; }
    const o = EX_OPTS[exSel];
    if (diamonds < o.d) {
      showToast(`Diamonds যথেষ্ট নেই — তোমার আছে ${diamonds.toLocaleString()}, লাগবে ${o.d.toLocaleString()}`);
      return;
    }
    spendDiamonds(o.d);
    setBeans((b) => b + o.b);
    showToast(`Exchange হয়েছে! ${o.d.toLocaleString()} Diamonds → ${o.b.toLocaleString()} Beans`);
  };

  const doWithdraw = () => {
    if (wdSel < 0) { showToast('আগে একটা Withdrawal option বেছে নাও'); return; }
    showToast('Not authenticated yet — আগে পরিচয় যাচাই (authentication) করতে হবে');
  };

  const claimTask = (task, i) => {
    if (tasksDone[i]) return;
    setTasksDone((d) => ({ ...d, [i]: true }));
    setTasksEarned((e) => e + task.reward);
    recharge({ coins: task.reward, bonus: 0 });
    showToast(`টাস্ক সম্পূর্ণ! +${task.reward} কয়েন ব্যালেন্সে যোগ হয়েছে`);
  };

  const openBadge = (badge) => { setBadgeDetail(badge); setView('badge'); };

  const beansUsd = (beans / BEANS_PER_USD).toFixed(1);

  const subHead = (title, backTo) => (
    <View style={[styles.headRow, { backgroundColor: t.surface }]}>
      <TouchableOpacity onPress={() => setView(backTo || 'main')} style={styles.backBtn}>
        <Text style={[styles.backTxt, { color: t.text }]}>‹</Text>
      </TouchableOpacity>
      <Text style={[styles.headTitle, { color: t.text }]}>{title}</Text>
    </View>
  );

  const menuRow = (icon, iconBg, label, right, onPress) => (
    <TouchableOpacity key={label} style={[styles.menuRow, { backgroundColor: t.surface, borderColor: t.border }]} onPress={onPress}>
      <View style={[styles.menuIcon, { backgroundColor: iconBg }]}><Text style={styles.menuEmoji}>{icon}</Text></View>
      <Text style={[styles.menuLabel, { color: t.text }]}>{label}</Text>
      {right}
      <Text style={styles.menuChev}>›</Text>
    </TouchableOpacity>
  );

  // ── My Level / VIP (separate components, own ScrollViews) ──
  if (view === 'level') {
    return (
      <LevelView
        gender={gender}
        onGenderChange={setGender}
        onBack={() => setView('main')}
        onTopUp={goWallet}
        showToast={showToast}
      />
    );
  }
  if (view === 'vip') {
    return (
      <VipView
        diamonds={diamonds}
        spendDiamonds={spendDiamonds}
        showToast={showToast}
        onBack={() => setView('main')}
        onTopUp={goWallet}
        vipOwned={vipOwned}
        setVipOwned={setVipOwned}
        vipDaysLeft={vipDaysLeft}
        setVipDaysLeft={setVipDaysLeft}
      />
    );
  }

  return (
    <ScrollView style={[styles.bg, { backgroundColor: t.bg }]} contentContainerStyle={styles.wrap}>
      {/* ── Me main ── */}
      {view === 'main' && (
        <View>
          <View style={styles.idHead}>
            <TouchableOpacity onPress={() => setView('profile')} activeOpacity={0.8} accessibilityLabel="ছবিতে চাপ দিয়ে My Profile পেজ খোলো">
              <Image source={AVATAR} style={styles.avatar} />
            </TouchableOpacity>
            <View style={styles.idMain}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: t.text }]}>{PROFILE.name}</Text>
                {vipOwned >= 0 && (
                  <TouchableOpacity style={styles.vipBadge} onPress={() => setView('vip')}>
                    <Text style={styles.vipBadgeTxt}>👑 VIP{vipOwned + 1}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.idRow}>
                <Text style={[styles.idTxt, { color: t.muted }]}>ID:&nbsp;{PROFILE.id}</Text>
                <TouchableOpacity onPress={copyId} accessibilityLabel="ID কপি করো">
                  <Text style={styles.copyIcon}>📋</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.chips}>
                <Text style={styles.flagChip}>🇸🇬</Text>
                <Text style={styles.chipMale}>♂ {PROFILE.age}</Text>
                <Text style={styles.chipLang}>{PROFILE.language}</Text>
              </View>
            </View>
            <View style={styles.topBtns}>
              <TouchableOpacity onPress={checkIn} style={styles.checkinBtn} accessibilityLabel="প্রতিদিনের চেক-ইন">
                <Text style={styles.checkinEmoji}>📅</Text>
                {!checkedIn && <View style={styles.redDot} />}
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleDark} style={styles.moonBtn} accessibilityLabel="ডার্ক মোড চালু বা বন্ধ করো">
                <Text style={styles.moonEmoji}>{dark ? '☀️' : '🌙'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.stats}>
            <TouchableOpacity style={styles.stat} onPress={() => showToast('Friend লিস্ট (প্রিভিউ)')}>
              <Text style={[styles.statNum, { color: t.text }]}>{PROFILE.friends}</Text>
              <Text style={[styles.statLbl, { color: t.muted }]}>Friend</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stat} onPress={() => showToast('Follow লিস্ট (প্রিভিউ)')}>
              <Text style={[styles.statNum, { color: t.text }]}>{PROFILE.following}</Text>
              <Text style={[styles.statLbl, { color: t.muted }]}>Follow</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stat} onPress={() => showToast('Fans লিস্ট (প্রিভিউ)')}>
              <Text style={[styles.statNum, { color: t.text }]}>{PROFILE.fans}</Text>
              <Text style={[styles.statLbl, { color: t.muted }]}>Fans</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cards}>
            <TouchableOpacity style={[styles.card, styles.cardWallet]} onPress={goWallet}>
              <Text style={styles.discountBadge}>🎁 Discount</Text>
              <Text style={styles.cardTitle}>My Wallet</Text>
              <Text style={styles.cardIcon}>💎</Text>
              <Text style={styles.cardValue}>{diamonds.toLocaleString()}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.card, styles.cardIncome]} onPress={() => setView('earn')}>
              <Text style={styles.cardTitleDark}>My Income</Text>
              <Text style={styles.cardIcon}>🪙</Text>
              <Text style={styles.cardValueDark}>{beans.toLocaleString()}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.menu}>
            {menuRow('💬', '#fde7f1', 'Messages', <Text style={styles.unreadBadge}>6</Text>, () => navigation.navigate('MessagesTab'))}
            {menuRow('📊', '#f1eafd', 'My Level', <Text style={styles.lvChip}>Lv{PROFILE.level}</Text>, () => setView('level'))}
            {menuRow('🎥', '#fde7f1', 'Host Dashboard', <Text style={styles.tagGreen}>Approved</Text>, () => navigation.navigate('HostDashboard'))}
            {menuRow('👥', '#fff0cd', 'My Invitation', <Text style={styles.tagGold}>Get Rewards</Text>, () => setView('invite'))}
            {menuRow('✅', '#e2f5ec', 'My Tasks', <Text style={styles.tagPink}>New Reward</Text>, () => setView('tasks'))}
            {menuRow('👤', '#e0f5fa', 'My Profile', null, () => setView('profile'))}
            {menuRow('👑', '#fef3c7', 'VIP', vipOwned >= 0 ? <Text style={styles.tagGold}>VIP{vipOwned + 1}</Text> : <Text style={styles.tagGold}>Member Centre</Text>, () => setView('vip'))}
            {menuRow('⚙️', '#eef0f4', 'Settings', null, () => setView('settings'))}
          </View>
        </View>
      )}

      {/* ── Earn beans (My Income) ── */}
      {view === 'earn' && (
        <View>
          {subHead('Earn beans')}
          <View style={[styles.earnCard, { backgroundColor: '#f5b93f' }]}>
            <View>
              <Text style={styles.earnLabel}>My income</Text>
              <Text style={styles.earnBeans}>{beans.toLocaleString()} <Text style={styles.earnUsd}>Beans = {beansUsd} USD</Text></Text>
            </View>
            <View style={styles.earnBtns}>
              <TouchableOpacity style={styles.earnBtn} onPress={() => setView('exchange')}><Text style={styles.earnBtnTxt}>Exchange</Text></TouchableOpacity>
              <TouchableOpacity style={styles.earnBtn} onPress={() => setView('withdraw')}><Text style={styles.earnBtnTxt}>Withdraw</Text></TouchableOpacity>
            </View>
          </View>
          <View style={styles.earnTabs}>
            {['Video income', 'Gift income', 'Other'].map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.earnTab, earnTab === tab && styles.earnTabOn]}
                onPress={() => setEarnTab(tab)}
              >
                <Text style={[styles.earnTabTxt, earnTab === tab && styles.earnTabTxtOn]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.calBtn} onPress={() => showToast('তারিখ অনুযায়ী আয়ের হিসাব (প্রিভিউ)')}>
            <Text style={styles.calEmoji}>📅</Text>
          </TouchableOpacity>
          <View style={styles.noData}>
            <Text style={styles.noDataEmoji}>📭</Text>
            <Text style={[styles.noDataTxt, { color: t.muted }]}>No data</Text>
          </View>
          <View style={styles.menu}>
            {menuRow('🎥', '#fde7f1', 'Chat Price', <Text style={styles.chatPriceVal}>{chatPrice.toLocaleString()}/min</Text>, () => setView('chatprice'))}
          </View>
        </View>
      )}

      {/* ── Exchange ── */}
      {view === 'exchange' && (
        <View>
          {subHead('Exchange', 'earn')}
          <View style={[styles.goldUser, { backgroundColor: t.surface }]}>
            <Image source={AVATAR} style={styles.goldAva} />
            <View>
              <Text style={[styles.goldName, { color: t.text }]}>{PROFILE.name}</Text>
              <Text style={[styles.goldId, { color: t.muted }]}>{PROFILE.id}</Text>
            </View>
          </View>
          <View style={styles.optGrid}>
            {EX_OPTS.map((o, i) => (
              <TouchableOpacity
                key={o.d}
                style={[styles.optTile, { backgroundColor: t.surface, borderColor: exSel === i ? COLORS.purple : t.border }]}
                onPress={() => setExSel(i)}
              >
                <Text style={[styles.optD, { color: t.text }]}>💎 {o.d.toLocaleString()}</Text>
                <Text style={styles.optB}>{o.b.toLocaleString()} Beans</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.myBeans, { color: t.text }]}>🪙 My Beans:&nbsp;{beansUsd}</Text>
          <TouchableOpacity style={styles.bigGradBtn} onPress={doExchange}>
            <Text style={styles.bigGradTxt}>Exchange</Text>
          </TouchableOpacity>
          <View style={styles.notes}>
            <Text style={[styles.noteLine, { color: t.muted }]}><Text style={styles.bang}>!</Text> Click &lt;Replace&gt; to switch the exchange beneficiary</Text>
            <Text style={[styles.noteLine, { color: t.muted }]}><Text style={styles.bang}>!</Text> Successful exchange, irrevocable</Text>
          </View>
        </View>
      )}

      {/* ── Withdraw ── */}
      {view === 'withdraw' && (
        <View>
          <View style={[styles.headRow, { backgroundColor: t.surface }]}>
            <TouchableOpacity onPress={() => setView('earn')} style={styles.backBtn}>
              <Text style={[styles.backTxt, { color: t.text }]}>‹</Text>
            </TouchableOpacity>
            <Text style={[styles.headTitle, { color: t.text }]}>Withdraw</Text>
            <TouchableOpacity onPress={() => showToast('Withdraw record — এখনো কোনো রেকর্ড নেই')}>
              <Text style={styles.recordLink}>Withdraw record</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.wdBanner, { backgroundColor: '#fb923c' }]}
            onPress={() => showToast('পরিচয় যাচাই (Authentication) — আসল অ্যাপে যাচাইয়ের পেজ খুলবে')}
          >
            <Image source={AVATAR} style={styles.wdAva} />
            <Text style={styles.wdBannerTxt}>Verify identity</Text>
            <Text style={styles.wdBannerChev}>›</Text>
          </TouchableOpacity>
          <Text style={[styles.wdAuth, { color: t.text }]}>Not authenticated yet <Text style={styles.bang}>!</Text></Text>
          <View style={styles.wdOptHead}>
            <Text style={[styles.wdOptTitle, { color: t.text }]}>Withdrawal option</Text>
            <Text style={[styles.wdBeans, { color: t.muted }]}>Beans: <Text style={{ fontWeight: 'bold', color: t.text }}>{beansUsd}</Text></Text>
          </View>
          <View style={styles.optGrid}>
            {WD_OPTS.map((o, i) => (
              <TouchableOpacity
                key={o.label}
                style={[styles.optTile, { backgroundColor: t.surface, borderColor: wdSel === i ? COLORS.purple : t.border }]}
                onPress={() => setWdSel(i)}
              >
                <Text style={[styles.optD, { color: t.text }]}>{o.label}</Text>
                <Text style={styles.optB}>{o.b.toLocaleString()} Beans</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.optTile, styles.sendTile, { backgroundColor: t.surface, borderColor: t.border }]}
              onPress={() => showToast('Send Beans — অন্য ইউজারের ID-তে Beans পাঠাও')}
            >
              <Text style={styles.sendTxt}>Send Beans</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.bigDarkBtn} onPress={doWithdraw}>
            <Text style={styles.bigDarkTxt}>Withdraw now</Text>
          </TouchableOpacity>
          <Text style={[styles.wdNote, { color: t.muted }]}>
            The minimum withdrawal amount for this method is <Text style={{ fontWeight: 'bold' }}>10</Text> dollars.{'\n'}
            The larger the single withdrawal amount, the lower the handling fee.
          </Text>
        </View>
      )}

      {/* ── My chat Price ── */}
      {view === 'chatprice' && (
        <View>
          {subHead('My chat Price', 'earn')}
          <View style={[styles.cardBox, { backgroundColor: t.surface }]}>
            <Text style={[styles.cardBoxTitle, { color: t.text }]}>Video Call Price</Text>
            <View style={styles.priceBigRow}>
              <Text style={[styles.priceBig, { color: t.text }]}>{chatPrice.toLocaleString()}<Text style={styles.pricePer}>/ min</Text></Text>
              <TouchableOpacity style={styles.editBtn} onPress={() => setPriceEditing((e) => !e)}>
                <Text style={styles.editBtnTxt}>{priceEditing ? 'Done' : 'Edit'}</Text>
              </TouchableOpacity>
            </View>
            {priceEditing && (
              <View>
                <View style={styles.priceOpts}>
                  {PRICE_OPTS.map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.priceOpt, chatPrice === v && styles.priceOptSel]}
                      onPress={() => { setChatPrice(v); showToast(`Video Call Price সেট হয়েছে: ${v.toLocaleString()}/min`); }}
                    >
                      <Text style={[styles.priceOptTxt, chatPrice === v && styles.priceOptTxtSel]}>{v.toLocaleString()}/min</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.hint, { color: t.muted }]}>তোমার লেভেল অনুযায়ী সর্বোচ্চ 3,000/min পর্যন্ত সেট করা যাবে।</Text>
              </View>
            )}
          </View>
          <View style={[styles.cardBox, { backgroundColor: t.surface }]}>
            <Text style={[styles.cardBoxTitle, { color: t.text }]}>Highest Call Price</Text>
            <View style={styles.tableHead}>
              <Text style={styles.th}>Level</Text>
              <Text style={styles.th}>সর্বোচ্চ দাম / min</Text>
            </View>
            {HIGHEST_CALL_PRICE.map((r) => (
              <View key={r.level} style={[styles.tableRow, { borderColor: t.border }]}>
                <Text style={[styles.td, { color: t.text }]}>{r.level}</Text>
                <Text style={[styles.td, { color: t.text }]}>{r.price}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── My Profile detail ── */}
      {view === 'profile' && (
        <View>
          <View style={styles.heroWrap}>
            <Image source={AVATAR} style={styles.heroImg} />
            <TouchableOpacity onPress={() => setView('main')} style={styles.heroBack}>
              <Text style={styles.heroBackTxt}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setView('edit')} style={styles.heroEdit}>
              <Text style={styles.heroEditTxt}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.pfMain, { backgroundColor: t.surface }]}>
            <View style={styles.pfIdRow}>
              <Image source={AVATAR} style={styles.pfAva} />
              <View style={{ flex: 1 }}>
                <View style={styles.pfNameRow}>
                  <Text style={[styles.pfName, { color: t.text }]}>{PROFILE.name}</Text>
                  <Text style={styles.onlineBadge}>● Online</Text>
                  {vipOwned >= 0 && <Text style={styles.vipBadge2}>👑 VIP{vipOwned + 1}</Text>}
                </View>
                <Text style={[styles.pfStats, { color: t.muted }]}>Follow <Text style={{ fontWeight: 'bold', color: t.text }}>{PROFILE.following}</Text>   Fans <Text style={{ fontWeight: 'bold', color: t.text }}>{PROFILE.fans}</Text></Text>
              </View>
            </View>
            <Text style={[styles.pfSig, { color: t.muted }]}>{PROFILE.signature}</Text>
            <View style={styles.chips}>
              <Text style={styles.chipMale}>♂ {PROFILE.age}</Text>
              <Text style={styles.flagChipTxt}>🇸🇬 Singapore</Text>
            </View>
            <Text style={styles.infoTab}>Information</Text>
            <Text style={[styles.albumEmpty, { color: t.muted }]}>There are no photos in the album yet~</Text>

            <View style={[styles.pfCard, { backgroundColor: t.surface2 }]}>
              <TouchableOpacity style={styles.pfBannerGold} onPress={() => setView('badge')}>
                <Text style={styles.pfBannerTitle}>Badge</Text>
                <Text style={styles.pfBannerIcon}>🏆</Text>
                <Text style={styles.pfBannerChev}>›</Text>
              </TouchableOpacity>
              <View style={styles.medalRow}>
                {PROFILE_MEDALS.map((m) => (
                  <TouchableOpacity key={m} style={styles.medal} onPress={() => openBadge([...BADGES_ACTIVITY, ...BADGES_ACH].find((b) => b.n === m))}>
                    <Text style={styles.medalIcon}>🏅</Text>
                    <Text style={[styles.medalName, { color: t.text }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.pfCard, { backgroundColor: t.surface2 }]}>
              <TouchableOpacity style={styles.pfBannerPink} onPress={() => setView('gift')}>
                <Text style={styles.pfBannerTitle}>Gift received</Text>
                <Text style={styles.pfBannerIcon}>🎁</Text>
                <Text style={styles.pfBannerChev}>›</Text>
              </TouchableOpacity>
              <View style={styles.giftEmpty}>
                <Text style={styles.giftEmptyIcon}>🎁</Text>
                <Text style={[styles.giftEmptyTxt, { color: t.muted }]}>Haven't received a gift yet</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ── Badge detail ── */}
      {view === 'badge' && (
        <View>
          {subHead('Badge', 'profile')}
          <View style={[styles.cardBox, { backgroundColor: t.surface }]}>
            <Text style={[styles.cardBoxTitle, { color: t.text }]}>{badgeDetail ? `${badgeDetail.n}${badgeDetail.got ? ' · পেয়ে গেছো' : ` · ${badgeDetail.p}`}` : 'একটা Badge বেছে নাও'}</Text>
            <Text style={[styles.hint, { color: t.muted }]}>
              {badgeDetail ? badgeDetail.d : 'নিচের যেকোনো Badge-এ চাপ দিলে সেটা কীভাবে পাওয়া যায়, তা এখানে দেখাবে।'}
            </Text>
          </View>
          <Text style={[styles.sec, { color: t.text }]}>Activity Medal</Text>
          <View style={styles.badgeGrid}>
            {BADGES_ACTIVITY.map((b) => (
              <TouchableOpacity key={b.n} style={[styles.badgeItem, { backgroundColor: t.surface }, badgeDetail && badgeDetail.n === b.n && styles.badgeSel]} onPress={() => setBadgeDetail(b)}>
                <View style={[styles.badgeIcon, { backgroundColor: b.bg }]}><Text style={styles.badgeEmoji}>{b.icon}</Text></View>
                <Text style={[styles.badgeName, { color: t.text }]}>{b.n}</Text>
                <Text style={[styles.badgeProg, { color: t.muted }]}>{b.p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.sec, { color: t.text }]}>Achievement</Text>
          <View style={styles.badgeGrid}>
            {BADGES_ACH.map((b) => (
              <TouchableOpacity key={b.n} style={[styles.badgeItem, { backgroundColor: t.surface }, badgeDetail && badgeDetail.n === b.n && styles.badgeSel]} onPress={() => setBadgeDetail(b)}>
                <View style={[styles.badgeIcon, { backgroundColor: b.bg }]}><Text style={styles.badgeEmoji}>{b.icon}</Text></View>
                <Text style={[styles.badgeName, { color: t.text }]}>{b.n}</Text>
                <Text style={[styles.badgeProg, { color: t.muted }]}>{b.p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── Gift received detail ── */}
      {view === 'gift' && (
        <View>
          {subHead('Gift received', 'profile')}
          <View style={styles.giftEmptyBig}>
            <Text style={styles.giftEmptyIconBig}>🎁</Text>
            <Text style={[styles.giftEmptyTxt, { color: t.muted }]}>Haven't received a gift yet</Text>
            <Text style={[styles.hint, { color: t.muted, textAlign: 'center' }]}>
              লাইভে গেলে বা প্রোফাইলে কেউ গিফট পাঠালে সেই গিফটগুলো এখানে একে একে জমা হবে — কে পাঠিয়েছে আর কত Diamonds-এর গিফট, সবসহ।
            </Text>
          </View>
        </View>
      )}

      {/* ── Edit Profile ── */}
      {view === 'edit' && (
        <View>
          {subHead('Edit Profile', 'profile')}
          <View style={styles.menu}>
            {[
              { label: 'My Avatar', value: '🖼️', onPress: () => showToast('My Avatar এডিট পেজ খুলবে') },
              { label: 'ID', value: PROFILE.id, copy: true },
              { label: 'Nickname', value: 'Williams', onPress: () => showToast('Nickname এডিট পেজ খুলবে') },
              { label: 'Gender', value: 'Male', onPress: () => showToast('Gender এডিট পেজ খুলবে') },
              { label: 'Age', value: '30', onPress: () => showToast('Age এডিট পেজ খুলবে') },
              { label: 'Regions', value: 'Singapore', onPress: () => showToast('Regions এডিট পেজ খুলবে') },
              { label: 'Location', value: 'SGP-Singapore', onPress: () => showToast('Location এডিট পেজ খুলবে') },
              { label: 'Language', value: 'English', onPress: () => showToast('Language এডিট পেজ খুলবে') },
              { label: 'Second Language', value: secondLang, onPress: () => setView('lang') },
              { label: 'Tags', value: 'Designer, Leo, Cricket…', onPress: () => showToast('Tags এডিট পেজ খুলবে') },
              { label: 'Self-introduction', value: 'Hello, I am Williams.', onPress: () => showToast('Self-introduction এডিট পেজ খুলবে') },
              { label: 'Cosmetics', value: 'Default', onPress: () => showToast('Cosmetics এডিট পেজ খুলবে') },
              { label: 'Google', value: 'Linked', onPress: () => showToast('Google এডিট পেজ খুলবে') },
              { label: 'Phone', value: '+65 •••• ••••', onPress: () => showToast('Phone এডিট পেজ খুলবে') },
              { label: 'Gmail', value: 'Linked', onPress: () => showToast('Gmail এডিট পেজ খুলবে') },
              { label: 'Password', value: '••••••••', onPress: () => showToast('Password এডিট পেজ খুলবে') },
              { label: 'Login Device', value: 'This device', onPress: () => showToast('Login Device এডিট পেজ খুলবে') },
            ].map((r) => (
              <TouchableOpacity
                key={r.label}
                style={[styles.editRow, { backgroundColor: t.surface, borderColor: t.border }]}
                onPress={r.onPress}
              >
                <Text style={[styles.editLabel, { color: t.text }]}>{r.label}</Text>
                {r.label === 'My Avatar'
                  ? <Image source={AVATAR} style={styles.editAva} />
                  : <Text style={[styles.editValue, { color: t.muted }]}>{r.value}</Text>}
                {r.copy
                  ? <TouchableOpacity onPress={copyId} style={styles.copyBtn}><Text style={styles.copyBtnTxt}>Copy</Text></TouchableOpacity>
                  : <Text style={styles.menuChev}>›</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── Second Language picker ── */}
      {view === 'lang' && (
        <View>
          {subHead('Second Language', 'edit')}
          <View style={styles.menu}>
            {LANGUAGES.map(([en, native]) => (
              <TouchableOpacity
                key={en}
                style={[styles.langRow, { backgroundColor: t.surface, borderColor: t.border }]}
                onPress={() => { setSecondLang(en); showToast(`Second Language: ${en}`); setView('edit'); }}
              >
                <Text style={[styles.langName, { color: t.text }]}>{en} <Text style={{ color: t.muted }}>{native}</Text></Text>
                {secondLang === en && <Text style={styles.langTick}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── My Invitation ── */}
      {view === 'invite' && (
        <View>
          {subHead('My Invitation')}
          <View style={[styles.cardBox, { backgroundColor: t.surface }]}>
            <Text style={[styles.cardBoxTitle, { color: t.text }]}>Invite friends, Get Rewards</Text>
            <Text style={[styles.hint, { color: t.muted }]}>বন্ধুদের আমন্ত্রণ জানাও — বন্ধু অ্যাপে যোগ দিলেই তুমি রিওয়ার্ড পাবে।</Text>
            <View style={styles.inviteCodeRow}>
              <Text style={[styles.inviteCode, { color: t.text }]}>LIVO-{PROFILE.id}</Text>
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={async () => { try { await Clipboard.setStringAsync(`LIVO-${PROFILE.id}`); } catch (e) { /* noop */ } showToast('Invitation code কপি হয়েছে'); }}
              >
                <Text style={styles.copyBtnTxt}>Copy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── My Tasks ── */}
      {view === 'tasks' && (
        <View>
          {subHead('আজকের টাস্ক')}
          <View style={[styles.taskSummary, { backgroundColor: t.surface }]}>
            <Text style={styles.taskSummaryIcon}>🪙</Text>
            <Text style={[styles.taskSummaryTxt, { color: t.text }]}>টাস্ক থেকে মোট আয়</Text>
            <Text style={[styles.taskSummaryVal, { color: t.text }]}>{tasksEarned}</Text>
            <Text style={[styles.taskSummaryTxt, { color: t.muted }]}>কয়েন</Text>
          </View>
          {TASKS.map((task, i) => (
            <View key={task.title} style={[styles.taskRow, { backgroundColor: t.surface }]}>
              <View style={[styles.taskIcon, { backgroundColor: task.bg }]}><Text style={styles.taskEmoji}>{task.icon}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.taskTitle, { color: t.text }]}>{task.title}</Text>
                <Text style={[styles.taskSub, { color: t.muted }]}>{task.sub}</Text>
              </View>
              <View style={styles.taskRight}>
                <Text style={styles.taskReward}>🪙+{task.reward}</Text>
                <TouchableOpacity
                  style={[styles.claimBtn, tasksDone[i] && styles.claimBtnDone]}
                  disabled={!!tasksDone[i]}
                  onPress={() => claimTask(task, i)}
                >
                  <Text style={styles.claimTxt}>{tasksDone[i] ? 'পেয়ে গেছো ✓' : 'দাবি করো'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <Text style={[styles.hint, { color: t.muted, textAlign: 'center' }]}>টাস্কগুলো পরে প্যানেল থেকে সেট করা যাবে — এখন নমুনা টাস্ক দেখানো হয়েছে।</Text>
        </View>
      )}

      {/* ── Settings ── */}
      {view === 'settings' && (
        <View>
          {subHead('Settings')}
          <View style={styles.menu}>
            {[
              { label: 'Notifications', value: 'On' },
              { label: 'App Language', value: 'English' },
              { label: 'Clear Cache', value: '12 MB' },
              { label: 'About Livo', value: 'v1.0.0' },
              { label: 'Privacy Policy', value: '' },
            ].map((r) => (
              <TouchableOpacity
                key={r.label}
                style={[styles.editRow, { backgroundColor: t.surface, borderColor: t.border }]}
                onPress={() => showToast(`${r.label} — প্রিভিউ`)}
              >
                <Text style={[styles.editLabel, { color: t.text }]}>{r.label}</Text>
                <Text style={[styles.editValue, { color: t.muted }]}>{r.value}</Text>
                <Text style={styles.menuChev}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.logoutTxt}>Log Out</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  albumEmpty: { fontSize: 13, marginTop: 10 },
  avatar: { borderRadius: 36, height: 72, width: 72 },
  backBtn: { alignItems: 'center', borderRadius: 20, height: 36, justifyContent: 'center', width: 36 },
  backTxt: { fontSize: 28, fontWeight: 'bold' },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 8 },
  badgeEmoji: { fontSize: 22 },
  badgeIcon: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  badgeItem: { alignItems: 'center', borderRadius: 12, marginBottom: 10, padding: 12, width: '31%' },
  badgeName: { fontSize: 12, fontWeight: 'bold', marginTop: 6, textAlign: 'center' },
  badgeProg: { fontSize: 11, marginTop: 2, textAlign: 'center' },
  badgeSel: { borderColor: COLORS.purple, borderWidth: 2 },
  bang: { color: '#ef4444', fontWeight: 'bold' },
  bg: { flex: 1 },
  bigDarkBtn: { backgroundColor: '#111827', borderRadius: 12, marginHorizontal: 16, marginTop: 16, paddingVertical: 14 },
  bigDarkTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  bigGradBtn: { backgroundColor: COLORS.purple, borderRadius: 12, marginHorizontal: 16, marginTop: 16, paddingVertical: 14 },
  bigGradTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  calBtn: { alignSelf: 'flex-end', marginRight: 16, marginTop: 12 },
  calEmoji: { fontSize: 24 },
  card: { borderRadius: 16, flex: 1, minHeight: 118, padding: 12 },
  cardBox: { borderRadius: 14, marginHorizontal: 16, marginTop: 12, padding: 14 },
  cardBoxTitle: { fontSize: 16, fontWeight: 'bold' },
  cardIcon: { fontSize: 30, marginTop: 6 },
  cardIncome: { backgroundColor: '#fde68a' },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginTop: 18 },
  cardTitleDark: { color: '#92400e', fontSize: 15, fontWeight: 'bold', marginTop: 18 },
  cardValue: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 4 },
  cardValueDark: { color: '#92400e', fontSize: 22, fontWeight: 'bold', marginTop: 4 },
  cardWallet: { backgroundColor: '#7c3aed' },
  cards: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 14 },
  chatPriceVal: { color: '#db2777', fontSize: 14, fontWeight: 'bold' },
  checkinBtn: { alignItems: 'center', justifyContent: 'center' },
  checkinEmoji: { fontSize: 26 },
  chipLang: { backgroundColor: '#f97316', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  chipMale: { backgroundColor: '#3b82f6', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  chips: { flexDirection: 'row', gap: 6, marginTop: 8 },
  claimBtn: { backgroundColor: '#f5b93f', borderRadius: 14, marginTop: 4, paddingHorizontal: 12, paddingVertical: 6 },
  claimBtnDone: { backgroundColor: '#d1d5db' },
  claimTxt: { color: '#1f2937', fontSize: 12, fontWeight: 'bold' },
  copyBtn: { backgroundColor: '#ede9fe', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  copyBtnTxt: { color: '#7c3aed', fontSize: 12, fontWeight: 'bold' },
  copyIcon: { fontSize: 18 },
  discountBadge: { backgroundColor: '#ec4899', borderRadius: 10, color: '#fff', fontSize: 11, fontWeight: 'bold', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', right: 8, top: -8 },
  earnBeans: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 4 },
  earnBtn: { backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8 },
  earnBtnTxt: { color: '#92400e', fontSize: 13, fontWeight: 'bold' },
  earnBtns: { flexDirection: 'row', gap: 8 },
  earnCard: { borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 12, padding: 16 },
  earnLabel: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  earnTab: { borderBottomColor: 'transparent', borderBottomWidth: 2, paddingBottom: 6, paddingHorizontal: 4 },
  earnTabOn: { borderBottomColor: '#f59e0b' },
  earnTabTxt: { color: '#6b7280', fontSize: 14 },
  earnTabTxtOn: { color: '#111827', fontWeight: 'bold' },
  earnTabs: { flexDirection: 'row', gap: 18, marginHorizontal: 16, marginTop: 16 },
  earnUsd: { fontSize: 13, fontWeight: 'normal' },
  editAva: { borderRadius: 20, height: 40, width: 40 },
  editBtn: { backgroundColor: '#ede9fe', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  editBtnTxt: { color: '#7c3aed', fontSize: 13, fontWeight: 'bold' },
  editLabel: { flex: 1, fontSize: 15 },
  editRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 13 },
  editValue: { fontSize: 14, marginRight: 8 },
  flagChip: { fontSize: 18 },
  flagChipTxt: { backgroundColor: '#eef2ff', borderRadius: 10, color: '#1e293b', fontSize: 12, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  giftEmpty: { alignItems: 'center', paddingVertical: 18 },
  giftEmptyBig: { alignItems: 'center', padding: 32 },
  giftEmptyIcon: { fontSize: 44 },
  giftEmptyIconBig: { fontSize: 64 },
  giftEmptyTxt: { fontSize: 14, marginTop: 10 },
  goldAva: { borderRadius: 24, height: 48, width: 48 },
  goldId: { fontSize: 13, marginTop: 2 },
  goldName: { fontSize: 17, fontWeight: 'bold' },
  goldUser: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 12, padding: 14 },
  headRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 44 },
  headTitle: { flex: 1, fontSize: 20, fontWeight: 'bold' },
  heroBack: { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 18, height: 36, justifyContent: 'center', left: 12, position: 'absolute', top: 44, width: 36 },
  heroBackTxt: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  heroEdit: { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, position: 'absolute', right: 12, top: 48 },
  heroEditTxt: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  heroImg: { height: 230, width: '100%' },
  heroWrap: { position: 'relative' },
  hint: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  idHead: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12 },
  idMain: { flex: 1, marginLeft: 12 },
  idRow: { alignItems: 'center', flexDirection: 'row', marginTop: 4 },
  idTxt: { fontSize: 14 },
  infoTab: { borderBottomColor: '#7c3aed', borderBottomWidth: 2, color: '#7c3aed', fontSize: 15, fontWeight: 'bold', marginTop: 16, paddingBottom: 6, width: 96 },
  inviteCode: { fontSize: 18, fontWeight: 'bold' },
  inviteCodeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  langName: { fontSize: 15 },
  langRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13 },
  langTick: { color: '#7c3aed', fontSize: 18, fontWeight: 'bold' },
  logoutBtn: { backgroundColor: '#ef4444', borderRadius: 12, marginHorizontal: 16, marginTop: 20, paddingVertical: 13 },
  logoutTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  lvChip: { backgroundColor: '#ede9fe', borderRadius: 10, color: '#7c3aed', fontSize: 12, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  medal: { alignItems: 'center', flex: 1 },
  medalIcon: { fontSize: 34 },
  medalName: { fontSize: 11, fontWeight: 'bold', marginTop: 4, textAlign: 'center' },
  medalRow: { flexDirection: 'row', paddingVertical: 12 },
  menu: { marginHorizontal: 16, marginTop: 14 },
  menuChev: { color: '#9ca3af', fontSize: 20 },
  menuEmoji: { fontSize: 18 },
  menuIcon: { alignItems: 'center', borderRadius: 10, height: 36, justifyContent: 'center', width: 36 },
  menuLabel: { flex: 1, fontSize: 15, marginLeft: 10 },
  menuRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', paddingVertical: 11 },
  moonBtn: { alignItems: 'center', justifyContent: 'center' },
  moonEmoji: { fontSize: 24 },
  myBeans: { fontSize: 15, fontWeight: 'bold', marginHorizontal: 16, marginTop: 16 },
  name: { fontSize: 22, fontWeight: 'bold' },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  noData: { alignItems: 'center', marginTop: 30 },
  noDataEmoji: { fontSize: 48 },
  noDataTxt: { fontSize: 14, marginTop: 8 },
  noteLine: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  notes: { marginHorizontal: 16, marginTop: 12 },
  onlineBadge: { backgroundColor: '#7c3aed', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 'bold', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3 },
  optB: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  optD: { fontSize: 15, fontWeight: 'bold' },
  optGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 12 },
  optTile: { borderRadius: 12, borderWidth: 1.5, marginBottom: 10, padding: 12, width: '48%' },
  pfAva: { borderRadius: 36, height: 72, width: 72 },
  pfBannerChev: { color: '#fff', fontSize: 22 },
  pfBannerGold: { alignItems: 'center', backgroundColor: '#f5b93f', borderTopLeftRadius: 12, borderTopRightRadius: 12, flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10 },
  pfBannerIcon: { fontSize: 20, marginLeft: 8 },
  pfBannerPink: { alignItems: 'center', backgroundColor: '#ec4899', borderTopLeftRadius: 12, borderTopRightRadius: 12, flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10 },
  pfBannerTitle: { color: '#fff', flex: 1, fontSize: 16, fontWeight: 'bold' },
  pfCard: { borderRadius: 12, marginTop: 14, overflow: 'hidden' },
  pfIdRow: { flexDirection: 'row', gap: 12 },
  pfMain: { borderTopLeftRadius: 18, borderTopRightRadius: 18, marginTop: -18, padding: 16 },
  pfName: { fontSize: 20, fontWeight: 'bold' },
  pfNameRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pfSig: { fontSize: 13, marginTop: 12 },
  pfStats: { fontSize: 13, marginTop: 6 },
  priceBig: { fontSize: 26, fontWeight: 'bold' },
  priceBigRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  priceOpt: { borderColor: '#d1d5db', borderRadius: 16, borderWidth: 1, marginRight: 8, marginTop: 8, paddingHorizontal: 12, paddingVertical: 7 },
  priceOptSel: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  priceOptTxt: { color: '#374151', fontSize: 13, fontWeight: 'bold' },
  priceOptTxtSel: { color: '#fff' },
  priceOpts: { flexDirection: 'row', flexWrap: 'wrap' },
  pricePer: { color: '#6b7280', fontSize: 14, fontWeight: 'normal' },
  recordLink: { color: '#7c3aed', fontSize: 13, fontWeight: 'bold' },
  redDot: { backgroundColor: '#ef4444', borderRadius: 5, height: 10, position: 'absolute', right: 0, top: 0, width: 10 },
  sec: { fontSize: 16, fontWeight: 'bold', marginHorizontal: 16, marginTop: 16 },
  sendTile: { alignItems: 'center', justifyContent: 'center' },
  sendTxt: { fontSize: 15, fontWeight: 'bold' },
  stat: { alignItems: 'center', flex: 1 },
  statLbl: { fontSize: 13, marginTop: 2 },
  statNum: { fontSize: 17, fontWeight: 'bold' },
  stats: { flexDirection: 'row', marginHorizontal: 16, marginTop: 16 },
  tableHead: { backgroundColor: '#eef2ff', borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 12, paddingVertical: 9 },
  tableRow: { borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  tagGold: { backgroundColor: '#fef3c7', borderRadius: 10, color: '#b45309', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  tagGreen: { backgroundColor: '#dcfce7', borderRadius: 10, color: '#16a34a', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  tagPink: { backgroundColor: '#fde7f1', borderRadius: 10, color: '#db2777', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  taskEmoji: { fontSize: 20 },
  taskIcon: { alignItems: 'center', borderRadius: 10, height: 44, justifyContent: 'center', width: 44 },
  taskReward: { color: '#b45309', fontSize: 13, fontWeight: 'bold' },
  taskRight: { alignItems: 'flex-end' },
  taskRow: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 8, padding: 12 },
  taskSub: { fontSize: 12, marginTop: 2 },
  taskSummary: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12, padding: 14 },
  taskSummaryIcon: { fontSize: 22 },
  taskSummaryTxt: { fontSize: 14 },
  taskSummaryVal: { fontSize: 16, fontWeight: 'bold' },
  taskTitle: { fontSize: 14, fontWeight: 'bold' },
  th: { fontSize: 13, fontWeight: 'bold' },
  td: { fontSize: 14 },
  topBtns: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  unreadBadge: { backgroundColor: '#ef4444', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 2 },
  vipBadge: { backgroundColor: '#f5b93f', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  vipBadge2: { backgroundColor: '#f5b93f', borderRadius: 10, color: '#1f2937', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  vipBadgeTxt: { color: '#1f2937', fontSize: 11, fontWeight: 'bold' },
  wdAuth: { fontSize: 14, fontWeight: 'bold', marginHorizontal: 16, marginTop: 10 },
  wdAva: { borderRadius: 20, height: 40, width: 40 },
  wdBanner: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 12, padding: 12 },
  wdBannerChev: { color: '#fff', fontSize: 22 },
  wdBannerTxt: { color: '#fff', flex: 1, fontSize: 15, fontWeight: 'bold' },
  wdBeans: { fontSize: 13 },
  wdNote: { fontSize: 12, lineHeight: 18, marginHorizontal: 16, marginTop: 12 },
  wdOptHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 14 },
  wdOptTitle: { fontSize: 15, fontWeight: 'bold' },
  wrap: { paddingBottom: 32 },
});
