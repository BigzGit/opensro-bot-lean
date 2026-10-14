// Item rules: what to do with each item of the game's catalogue, like sBot's item list.
// A rule is per exact item (refObjId) and per character: pick (always / never) and one action (store in the warehouse,
// sell at the repair merchant, keep, or drop). Rules come first; without one the Loot categories and the town settings
// decide as before. Filters read the item's codename: ITEM_<race>_[<gender>_]<type>_<degree>_..., e.g.
// ITEM_CH_SWORD_09_C_RARE or ITEM_EU_W_LIGHT_05_SA_A. Armour parts follow the equipment slots in roster.json.
const ITEM_ACTIONS = ['store', 'sell', 'keep', 'drop'];
const ITEM_ARMOUR_PART = { CA: 'Head', HA: 'Head', SA: 'Shoulder', BA: 'Chest', AA: 'Hand', LA: 'Trouser', FA: 'Boot' };
const ITEM_ARMOUR_KIND = { CLOTHES: 'Garment', LIGHT: 'Protector', HEAVY: 'Armor' };
const ITEM_WEAPON = { CH: { BLADE: 'Blade', SWORD: 'Sword', TBLADE: 'Glaive', SPEAR: 'Spear', BOW: 'Bow' },
  EU: { SWORD: '1HSword', TSWORD: '2HSword', AXE: 'Axe', CROSSBOW: 'X-Bow', DAGGER: 'Dagger', TSTAFF: 'Staff', DARKSTAFF: 'W-Rod', STAFF: 'C-Rod', HARP: 'Harp' } };
const ITEM_ACCESSORY = { NECKLACE: 'Necklace', EARRING: 'Earring', RING: 'Ring' };
const ITEM_DROP_CONFIRM_MS = 5000;
const ItemRules = {
  infos: new Map(), dropping: null, dropBan: new Map(), message: '',
  cfg() { return Settings.profile.items; },
  get(id) { return this.cfg().rules[id] || null; },
  // change: { pick: 'yes' | 'no' | null, act: 'store' | 'sell' | 'keep' | 'drop' | null }; null clears that part.
  set(ids, change) {
    const rules = this.cfg().rules;
    for (const id of ids) {
      const rule = { ...rules[id] };
      for (const [key, value] of Object.entries(change)) { if (value === null) delete rule[key]; else rule[key] = value; }
      if (rule.act === 'drop') delete rule.pick; // a dropped item is never picked up again
      if (Object.keys(rule).length) rules[id] = rule; else delete rules[id];
    }
    Settings.saveProfile();
  },
  count() { return Object.keys(this.cfg().rules).length; },
  // What the codename says about an item, for the filters and the table. Cached per item.
  info(id) {
    if (this.infos.has(id)) return this.infos.get(id);
    const row = Items.data.get(id), code = row?.code || '', p = code.split('_');
    const race = p[1] === 'CH' || p[1] === 'EU' ? p[1] : '', gendered = race && (p[2] === 'M' || p[2] === 'W');
    const type = race ? p[gendered ? 3 : 2] : '', degree = race ? Number(/_(\d{2})(?:_|$)/.exec(code)?.[1]) || 0 : 0;
    let group = 'other', kind = '';
    if (race && ITEM_ARMOUR_KIND[type]) { group = 'armour'; kind = ITEM_ARMOUR_PART[p[gendered ? 5 : 4]] || ''; }
    else if (race && type === 'SHIELD') { group = 'armour'; kind = 'Shield'; }
    else if (race && ITEM_WEAPON[race][type]) { group = 'weapon'; kind = ITEM_WEAPON[race][type]; }
    else if (race && ITEM_ACCESSORY[type]) { group = 'accessory'; kind = ITEM_ACCESSORY[type]; }
    else if (/^ITEM_ETC_(HP|MP|ALL)_/.test(code)) group = 'potion';
    else if (/^ITEM_ETC_CURE_/.test(code)) group = 'pill';
    else if (/^ITEM_ETC_ARCHEMY_/.test(code)) group = 'alchemy';
    else if (/^ITEM_ETC_AMMO_/.test(code)) group = 'ammo';
    else if (/SCROLL/.test(code)) group = 'scroll';
    else if (/^ITEM_COS_/.test(code)) group = 'pet';
    else if (/^ITEM_Q/.test(code)) group = 'quest';
    else if (/^ITEM_MALL_/.test(code)) group = 'mall';
    const info = { id, name: row?.name || '#' + id, code, icon: row?.icon || '', race, degree, group, kind,
      material: race ? ITEM_ARMOUR_KIND[type] || '' : '', gender: gendered ? (p[2] === 'M' ? 'Male' : 'Female') : '', sox: Items.sox(id) };
    this.infos.set(id, info);
    return info;
  },
  // Every catalogue item that passes the filters, in id order. f: { query, group, race, gender, degrees: Set, kind, custom, nearby }.
  list(f) {
    const query = (f.query || '').toLowerCase().trim(), rules = this.cfg().rules, out = [];
    // Item numbers of the drops in view: the exact items to give a rule, whatever the item is called in the catalogue.
    const ground = f.nearby ? new Set([...World.ents.values()].filter(e => e.kind === 'ground-item').map(e => e.refObjId)) : null;
    for (const id of Items.data.keys()) {
      if (f.custom && !rules[id]) continue;
      if (ground && !ground.has(id)) continue;
      const i = this.info(id);
      if (f.group && f.group !== 'all' && (f.group === 'equipment' ? !['weapon', 'armour', 'accessory'].includes(i.group) : i.group !== f.group)) continue;
      if (f.race && i.race !== f.race) continue;
      if (f.gender && i.gender && i.gender !== f.gender) continue;
      if (f.degrees?.size && !f.degrees.has(i.degree)) continue;
      if (f.kind && i.kind !== f.kind && i.material !== f.kind) continue;
      if (query && !i.name.toLowerCase().includes(query) && !i.code.toLowerCase().includes(query) && String(id) !== query) continue;
      out.push(i);
    }
    return out.sort((a, b) => a.id - b.id);
  },
  // Drop items with a Drop rule from the character bag (never worn gear) or the pickup pet, one at a time, while
  // hunting and outside town service and open windows. A drop counts once the item has left that slot.
  dropTick() {
    const gp = World.gp;
    if (!Hunt.running || Town.trip || !World.inWorld() || World.isDead() || !gp || gp.inventoryPending || gp.storage || gp.exchange?.open || Restock.activeShop()) return false;
    const t = now(), d = this.dropping;
    if (d) {
      const still = (d.pet ? Loot.items(d.pet) : World.items()).some(i => i.slot === d.slot && i.refObjId === d.ref);
      if (!still) { this.dropping = null; Log.info('Dropped ' + Items.name(d.ref) + ' (item rule).'); }
      else if (t - d.at < ITEM_DROP_CONFIRM_MS) return false;
      else { this.dropping = null; this.dropBan.set(d.key, t + 30000); this.message = Items.name(d.ref) + ' was not dropped; trying again in 30 s.'; Log.warn(this.message); }
    }
    if (!this.count()) return false;
    const equipped = gp.equipmentSlotCount || 13, pet = Loot.pet();
    const sources = [[0, World.items().filter(i => i.slot >= equipped)], ...(pet ? [[pet.rec.gid, pet.rec.inventory || []]] : [])];
    for (const [petGid, items] of sources) for (const item of items) {
      if (this.get(item.refObjId)?.act !== 'drop') continue;
      const key = petGid + ':' + item.slot + ':' + item.refObjId;
      if ((this.dropBan.get(key) || 0) > t) continue;
      const command = petGid ? { kind: 'cos-drop', gid: petGid, slot: item.slot } : { kind: 'item-drop', slot: item.slot };
      if (!Cmd.spaced(command.kind) || !Cmd.raw(command, 'Drop ' + Items.name(item.refObjId))) return false;
      this.dropping = { key, pet: petGid, slot: item.slot, ref: item.refObjId, at: t };
      return true;
    }
    return false;
  },
};
