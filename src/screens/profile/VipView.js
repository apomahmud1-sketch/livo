// Livo — VIP Member Centre (black & gold), from the web preview.
// VIP1 Baron / VIP2 Earl / VIP3 Marquis / VIP4 Duke / VIP5 King.
// Prices: 60,000 / 120,000 / 300,000 Diamond per 30 days for VIP1-3
// (VIP4 600,000 and VIP5 1,200,000 are preview samples).
// Buying deducts Diamonds from the shared store balance and binds the
// VIP tier to the user ID for 30 days.
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BADGES_ACTIVITY, BADGES_ACH, PROFILE, VIP_IDENT, VIP_PRIV, VIP_TIERS } from './levelData';

export default function VipView({
  diamonds, spendDiamonds, showToast, onBack, onTopUp,
  vipOwned, setVipOwned, vipDaysLeft, setVipDaysLeft,
}) {
  const [vipSel, setVipSel] = React.useState(0);
  const [pop, setPop] = React.useState(null); // {t, note, key} | null
  const [worn, setWorn] = React.useState({});
  const tier = VIP_TIERS[vipSel];
  const isActive = vipSel === vipOwned;
  const isUpgrade = vipOwned >= 0 && vipSel > vipOwned;

  const buy = () => {
    if (isActive) return;
    if (diamonds < tier.price) {
      showToast(`Diamonds যথেষ্ট নেই — তোমার আছে ${diamonds.toLocaleString()}, লাগবে ${tier.price.toLocaleString()}। আগে Recharge করো`);
      setTimeout(onTopUp, 650);
      return;
    }
    spendDiamonds(tier.price);
    setVipOwned(vipSel);
    setVipDaysLeft(30);
    showToast(`${tier.name} VIP চালু হয়েছে! তোমার ID-তে ${tier.name} ব্যাজ বসে গেছে · 30 days`);
  };

  const renderBenefit = (bn, num) => {
    const on = num >= bn.unlock;
    return (
      <TouchableOpacity
        key={bn.t}
        style={[styles.ben, !on && styles.benLocked]}
        onPress={() => setPop(bn)}
      >
        <Text style={styles.benIcon}>{bn.icon}</Text>
        <Text style={styles.benTxt}>{bn.t}</Text>
        {!on && <Text style={styles.benLock}>VIP{bn.unlock}</Text>}
      </TouchableOpacity>
    );
  };

  const popBody = () => {
    if (!pop) return null;
    const rows = [];
    if (pop.key === 'bubble') {
      VIP_TIERS.forEach((t) => rows.push(
        <View key={t.name} style={[styles.popRow, { backgroundColor: t.grad[0] }]}>
          <Text style={styles.popRowTxt}>Hello everyone! Welcome to the room</Text>
          <Text style={styles.popTier}>{t.name}</Text>
        </View>
      ));
    } else if (pop.key === 'entrance') {
      VIP_TIERS.forEach((t) => rows.push(
        <View key={t.name} style={[styles.popRow, { backgroundColor: t.grad[0] }]}>
          <Text style={styles.popRowTxt}>👤 Mr.lee entered the room</Text>
          <Text style={styles.popTier}>{t.name}</Text>
        </View>
      ));
    } else if (pop.key === 'headwear') {
      VIP_TIERS.forEach((t) => rows.push(
        <View key={t.name} style={styles.popHwRow}>
          <Text style={styles.popHw}>👑</Text>
          <Text style={[styles.popHwName, { color: t.color }]}>{t.name}</Text>
        </View>
      ));
    } else if (pop.key === 'cards') {
      VIP_TIERS.forEach((t) => rows.push(
        <View key={t.name} style={styles.popCard}>
          <Text style={styles.popCardTxt}>🖼️ {t.name} Room Display Card</Text>
        </View>
      ));
    } else if (pop.key === 'badgeslots') {
      [...BADGES_ACTIVITY, ...BADGES_ACH].forEach((b) => rows.push(
        <View key={b.n} style={styles.popWearRow}>
          <Text style={styles.popWearTxt}>{b.icon} {b.n}</Text>
          <TouchableOpacity
            style={[styles.wearBtn, worn[b.n] && styles.wearBtnOn]}
            disabled={!!worn[b.n]}
            onPress={() => { setWorn((w) => ({ ...w, [b.n]: true })); showToast(`${b.n} পরা হয়েছে — তোমার প্রোফাইলে দেখাবে`); }}
          >
            <Text style={styles.wearTxt}>{worn[b.n] ? 'Wearing' : 'Wear'}</Text>
          </TouchableOpacity>
        </View>
      ));
    } else if (pop.key === 'seat') {
      for (let i = 0; i < 5; i += 1) {
        const isVip = i === 2;
        rows.push(
          <View key={i} style={[styles.popSeat, isVip && styles.popSeatVip]}>
            <Text style={styles.popSeatTxt}>{isVip ? '👑 VIP Seat' : `🎙️ Seat ${i + 1}`}</Text>
          </View>
        );
      }
    }
    return (
      <View>
        {rows}
        <Text style={styles.popNote}>{pop.note}</Text>
        <TouchableOpacity style={styles.joinBtn} onPress={() => { setPop(null); if (!isActive) buy(); }}>
          <Text style={styles.joinTxt}>Join VIP</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.bg}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.headRow}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}><Text style={styles.backTxt}>‹</Text></TouchableOpacity>
          <Text style={styles.headTitle}>Member Centre</Text>
          <Text style={styles.balChip}>💎 {diamonds.toLocaleString()}</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
          {VIP_TIERS.map((t, i) => (
            <TouchableOpacity
              key={t.name}
              style={[styles.tab, vipSel === i && styles.tabOn, vipOwned === i && styles.tabOwned]}
              onPress={() => setVipSel(i)}
            >
              <Text style={[styles.tabTxt, vipSel === i && styles.tabTxtOn]}>{t.name}{vipOwned === i ? ' ●' : ''}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Big golden shield badge */}
        <View style={styles.hero}>
          <View style={[styles.shield, { borderColor: tier.color }]}>
            <Text style={styles.shieldCrown}>👑</Text>
            <Text style={styles.shieldTier}>{tier.name}</Text>
          </View>
          <Text style={styles.tierName}>{tier.title}</Text>
          <Text style={styles.tierSub}>{tier.name}</Text>
        </View>

        <View style={styles.userCard}>
          <View style={styles.userAva}><Text style={styles.userAvaTxt}>M</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{PROFILE.name}</Text>
            <Text style={styles.userId}>ID: {PROFILE.id}</Text>
          </View>
          <Text style={[styles.userStatus, vipOwned >= 0 && styles.userStatusOn]}>
            {vipOwned >= 0 ? `${VIP_TIERS[vipOwned].name} · ${vipDaysLeft} days left` : 'Not activated yet'}
          </Text>
        </View>

        <Text style={styles.sec}>Identification</Text>
        <View style={styles.grid}>{VIP_IDENT.map((bn) => renderBenefit(bn, vipSel + 1))}</View>

        <Text style={styles.sec}>Exclusive privilege</Text>
        <View style={styles.grid}>{VIP_PRIV.map((bn) => renderBenefit(bn, vipSel + 1))}</View>

        <Text style={styles.note}>
          যেকোনো সুবিধায় চাপ দিলে সেটা কেমন দেখায়, পপআপে দেখা যাবে। VIP কিনলে সেটা তোমার ID-র সাথে বাঁধা থাকবে — যেকোনো ডিভাইসে লগইন করলেই কাজ করবে।
        </Text>
        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Bottom price + buy bar */}
      <View style={styles.buyBar}>
        <View>
          <Text style={styles.buyAmt}>💎 {tier.price.toLocaleString()}</Text>
          <Text style={styles.buySub}>Diamond / 30 Days</Text>
        </View>
        <TouchableOpacity
          style={[styles.buyBtn, isActive && styles.buyBtnActive]}
          onPress={buy}
          disabled={isActive}
        >
          <Text style={styles.buyTxt}>
            {isActive ? `${tier.name} Active · ${vipDaysLeft} days left` : isUpgrade ? `Upgrade to ${tier.name}` : 'Become VIP'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Benefit detail popup */}
      <Modal visible={!!pop} transparent animationType="slide" onRequestClose={() => setPop(null)}>
        <View style={styles.modalBg}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{pop ? pop.t : ''}</Text>
              <TouchableOpacity onPress={() => setPop(null)}><Text style={styles.sheetX}>✕</Text></TouchableOpacity>
            </View>
            {popBody()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { alignItems: 'center', borderRadius: 20, height: 36, justifyContent: 'center', width: 36 },
  backTxt: { color: '#f5d76e', fontSize: 28, fontWeight: 'bold' },
  balChip: { color: '#f5d76e', fontSize: 14, fontWeight: 'bold' },
  ben: { alignItems: 'center', backgroundColor: '#1c1c22', borderRadius: 12, margin: 4, paddingVertical: 14, width: '30%' },
  benIcon: { fontSize: 24 },
  benLock: { color: '#f5b93f', fontSize: 11, fontWeight: 'bold', marginTop: 4 },
  benLocked: { opacity: 0.55 },
  benTxt: { color: '#f3f4f6', fontSize: 11, fontWeight: 'bold', marginTop: 6, textAlign: 'center' },
  bg: { backgroundColor: '#0d0d12', flex: 1 },
  buyAmt: { color: '#f5d76e', fontSize: 19, fontWeight: 'bold' },
  buyBar: { alignItems: 'center', backgroundColor: '#17171d', borderTopColor: '#2a2a33', borderTopWidth: 1, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', left: 0, padding: 14, position: 'absolute', right: 0 },
  buyBtn: { backgroundColor: '#f5b93f', borderRadius: 24, paddingHorizontal: 22, paddingVertical: 12 },
  buyBtnActive: { backgroundColor: '#374151' },
  buySub: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  buyTxt: { color: '#1f2937', fontSize: 14, fontWeight: 'bold' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 },
  headRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 44 },
  headTitle: { color: '#f5d76e', flex: 1, fontSize: 20, fontWeight: 'bold' },
  hero: { alignItems: 'center', marginTop: 10 },
  joinBtn: { backgroundColor: '#f5b93f', borderRadius: 10, marginTop: 14, paddingVertical: 12 },
  joinTxt: { color: '#1f2937', fontSize: 15, fontWeight: 'bold', textAlign: 'center' },
  modalBg: { backgroundColor: 'rgba(0,0,0,0.6)', flex: 1, justifyContent: 'flex-end' },
  note: { color: '#9ca3af', fontSize: 12, lineHeight: 18, marginHorizontal: 16, marginTop: 14 },
  popCard: { backgroundColor: '#f3f4f6', borderRadius: 10, marginTop: 8, padding: 12 },
  popCardTxt: { fontSize: 14, fontWeight: 'bold' },
  popHw: { fontSize: 26 },
  popHwName: { fontSize: 14, fontWeight: 'bold', marginTop: 4 },
  popHwRow: { alignItems: 'center', flex: 1 },
  popNote: { color: '#6b7280', fontSize: 13, lineHeight: 19, marginTop: 12 },
  popRow: { borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, padding: 12 },
  popRowTxt: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  popSeat: { backgroundColor: '#f3f4f6', borderRadius: 10, marginTop: 8, padding: 12 },
  popSeatTxt: { fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  popSeatVip: { backgroundColor: '#fef3c7', borderColor: '#f5b93f', borderWidth: 1.5 },
  popTier: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  popWearRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  popWearTxt: { fontSize: 14 },
  sec: { color: '#f5d76e', fontSize: 16, fontWeight: 'bold', marginHorizontal: 16, marginTop: 18 },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '80%', padding: 16 },
  sheetHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 18, fontWeight: 'bold' },
  sheetX: { color: '#6b7280', fontSize: 18, fontWeight: 'bold' },
  shield: { alignItems: 'center', backgroundColor: '#1c1c22', borderRadius: 70, borderWidth: 3, height: 132, justifyContent: 'center', width: 132 },
  shieldCrown: { fontSize: 34 },
  shieldTier: { color: '#fff7dd', fontSize: 20, fontWeight: '800', marginTop: 4 },
  tab: { borderColor: '#3f3f46', borderRadius: 18, borderWidth: 1, marginRight: 8, paddingHorizontal: 14, paddingVertical: 8 },
  tabOn: { backgroundColor: '#f5b93f', borderColor: '#f5b93f' },
  tabOwned: { borderColor: '#f5b93f' },
  tabTxt: { color: '#d4d4d8', fontSize: 13, fontWeight: 'bold' },
  tabTxtOn: { color: '#1f2937' },
  tabs: { marginLeft: 16, marginTop: 12 },
  tierName: { color: '#f5d76e', fontSize: 22, fontWeight: 'bold', marginTop: 10 },
  tierSub: { color: '#9ca3af', fontSize: 14, marginTop: 2 },
  userAva: { alignItems: 'center', backgroundColor: '#7c3aed', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  userAvaTxt: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  userCard: { alignItems: 'center', backgroundColor: '#1c1c22', borderRadius: 14, flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 14, padding: 12 },
  userId: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  userName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  userStatus: { color: '#9ca3af', fontSize: 12 },
  userStatusOn: { color: '#4ade80', fontWeight: 'bold' },
  wearBtn: { backgroundColor: '#f5b93f', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  wearBtnOn: { backgroundColor: '#d1d5db' },
  wearTxt: { color: '#1f2937', fontSize: 12, fontWeight: 'bold' },
  wrap: { paddingBottom: 24 },
});
