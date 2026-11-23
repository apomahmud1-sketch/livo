// Livo — VIP Member Centre (black & gold), from the web preview.
// VIP1 Baron / VIP2 Earl / VIP3 Marquis / VIP4 Duke / VIP5 King.
//
// VIP status comes ONLY from the store (store.vipLevel /
// store.vipUntil, set from the profiles row by a real Play purchase).
// There is NO diamond buy here: the old local buy() that deducted
// real Diamonds and set local-only state is deleted. The diamond
// prices shown per tier are preview values with no purchase path,
// so no Buy button is offered for them — buying Premium goes through
// the VIP screen's Play packs (store.buyVip) via onBuyPremium.
// The "binds to your ID — works on any device" note stays because
// the status shown is store-driven (the profiles row, not the device).
// Badge "Wear" buttons are removed: badge wearing has no persisted
// store path (no profiles.frame_id wear state in the store).
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../../store';
import { BADGES_ACTIVITY, BADGES_ACH, VIP_IDENT, VIP_PRIV, VIP_TIERS } from './levelData';

// store vipLevel is a pack id such as 'vip1' — the matching tier
// index is 0-based (vip1 → VIP_TIERS[0]).
function ownedTierIndex(vipLevel) {
  if (!vipLevel) return -1;
  const m = String(vipLevel).match(/^vip\s?(\d+)$/i);
  if (!m) return -1;
  const idx = parseInt(m[1], 10) - 1;
  return idx >= 0 && idx < VIP_TIERS.length ? idx : -1;
}

function vipLabel(v) {
  if (!v) return null;
  const m = String(v).match(/^vip\s?(\d+)$/i);
  return m ? `VIP ${m[1]}` : String(v);
}

export default function VipView({
  showToast, onBack, onTopUp, onBuyPremium,
}) {
  const { diamonds, vipLevel, vipUntil } = useApp();
  const [vipSel, setVipSel] = React.useState(0);
  const [pop, setPop] = React.useState(null); // {t, note, key} | null
  const tier = VIP_TIERS[vipSel];
  const ownedIdx = ownedTierIndex(vipLevel);
  const daysLeft = vipUntil
    ? Math.max(0, Math.ceil((new Date(vipUntil).getTime() - Date.now()) / 86400000))
    : 0;

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
          <Text style={styles.popRowTxt}>👤 You entered the room</Text>
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
      // Badges are shown here for reference only — there is no
      // persisted "wear" state, so no Wear button is offered.
      [...BADGES_ACTIVITY, ...BADGES_ACH].forEach((b) => rows.push(
        <View key={b.n} style={styles.popWearRow}>
          <Text style={styles.popWearTxt}>{b.icon} {b.n}</Text>
          <Text style={styles.popWearTxt}>{b.p}</Text>
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
        {ownedIdx < 0 ? (
          <TouchableOpacity style={styles.joinBtn} onPress={() => { setPop(null); if (onBuyPremium) onBuyPremium(); }}>
            <Text style={styles.joinTxt}>See Premium packs</Text>
          </TouchableOpacity>
        ) : null}
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
              style={[styles.tab, vipSel === i && styles.tabOn, ownedIdx === i && styles.tabOwned]}
              onPress={() => setVipSel(i)}
            >
              <Text style={[styles.tabTxt, vipSel === i && styles.tabTxtOn]}>{t.name}{ownedIdx === i ? ' ●' : ''}</Text>
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
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{vipLevel ? vipLabel(vipLevel) : 'Not a VIP member yet'}</Text>
            <Text style={styles.userId}>
              {vipLevel && vipUntil
                ? `Active until ${new Date(vipUntil).toLocaleDateString()} · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
                : 'Your VIP status lives on your account — buy Premium to activate it.'}
            </Text>
          </View>
          <Text style={[styles.userStatus, vipLevel && styles.userStatusOn]}>
            {vipLevel ? 'Active' : 'Not activated yet'}
          </Text>
        </View>

        <Text style={styles.sec}>Identification</Text>
        <View style={styles.grid}>{VIP_IDENT.map((bn) => renderBenefit(bn, vipSel + 1))}</View>

        <Text style={styles.sec}>Exclusive privilege</Text>
        <View style={styles.grid}>{VIP_PRIV.map((bn) => renderBenefit(bn, vipSel + 1))}</View>

        <Text style={styles.note}>
          যেকোনো সুবিধায় চাপ দিলে সেটা কেমন দেখায়, পপআপে দেখা যাবে। VIP কিনলে সেটা তোমার ID-র সাথে বাঁধা থাকবে — যেকোনো ডিভাইসে লগইন করলেই কাজ করবে। Tier prices below are preview values — Premium is bought with real money from the Premium packs, not with Diamonds.
        </Text>

        <View style={styles.buyRow}>
          <View>
            <Text style={styles.buyAmt}>💎 {tier.price.toLocaleString()}</Text>
            <Text style={styles.buySub}>Diamond / 30 Days — preview price, not buyable</Text>
          </View>
          {ownedIdx < 0 ? (
            <TouchableOpacity style={styles.buyBtn} onPress={() => { if (onBuyPremium) onBuyPremium(); else if (onTopUp) onTopUp(); }}>
              <Text style={styles.buyTxt}>See Premium packs</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.buyBtn, styles.buyBtnActive]}>
              <Text style={styles.buyTxt}>{vipLabel(vipLevel)} Active · {daysLeft} days left</Text>
            </View>
          )}
        </View>
        <View style={{ height: 24 }} />
      </ScrollView>

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
  buyRow: { alignItems: 'center', backgroundColor: '#17171d', borderRadius: 14, flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 16, padding: 14 },
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
