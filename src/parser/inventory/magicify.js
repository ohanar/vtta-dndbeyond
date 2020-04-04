/**
Attempts to parse information from ddb about items to build a magicitems
compatible set of metadata.

https://gitlab.com/riccisi/foundryvtt-magic-items/

 * Wand of Entangle Target example
 *
  flags": {
  "magicitems": {
      "enabled": true,
      "charges": "7",
      "chargeType": "c1",
      "destroy": true,
      "destroyCheck": "d1",
      "rechargeable": true,
      "recharge": "1d6+1",
      "rechargeType": "t2",
      "rechargeUnit": "r2",
      "spells": {
          "0": {
              "id": "af8QUpphSZMoi2yb",
              "name": "Entangle",
              "pack": "world.spellsdndbeyond",
              "img": "iconizer/Spell_Nature_StrangleVines.png",
              "baseLevel": "1",
              "level": "1",
              "consumption": "1",
              "upcast": "1",
              "upcastCost": "1"
          }
      }
  }
 * 
 * 
 **/
import DICTIONARY from "../dictionary.js";
import utils from "../../utils.js";

// Expected location of magicitems module
const magicItemsPath = '../../../../magicitems/magicitem.js';

const MAGICITEMS = {};
MAGICITEMS.DAILY = 'r1';
MAGICITEMS.SHORT_REST = 'r4';
MAGICITEMS.LONG_REST = 'r5';
MAGICITEMS.CHARGE_TYPE_WHOLE_ITEM = "c1";
MAGICITEMS.CHARGE_TYPE_PER_SPELL = "c2";
MAGICITEMS.NUMERIC_RECHARGE = 't1';
MAGICITEMS.FORMULA_RECHARGE = 't2';
MAGICITEMS.DestroyCheckAlways = "d1";
MAGICITEMS.DestroyCheck1D20 = "d2";


function getRechargeFormula(description, maxCharges) {
  if (description === "") {
    return maxCharges;
  };

  let chargeMatchFormula = /regains (?<formula>\dd\d* \+ \d) expended charges/i;
  let chargeMatchFixed = /regains (?<formula>\d*) /i;
  let chargeMatchLastDitch = /(?<formula>\dd\d* \+ \d)/i;
  let chargeNextDawn = /can't be used this way again until the next/i;

  let match = chargeMatchFormula.exec(description);

  if (match && match.groups.formula) {
    match = match.groups.formula;
  } else if (match = chargeMatchFixed.exec(description)) {
    match = match.groups.formula;
  } else if (match = chargeMatchLastDitch.exec(description)) {
    match = match.groups.formula;
  } else if (description.search(chargeNextDawn) !== -1) {
    match = maxCharges;
  };

  return match;
};

function getPerSpells(description) {
  if (description === "") {
    return false;
  };

  let perSpell = /each (?<num>[A-z]*|\n*) per/i;
  let match = perSpell.exec(description);

  if (match && match.groups.num) {
    match = DICTIONARY.magicitems.nums.find(
      num => num.id == match.groups.num
    ).value;
  } else {
    match = null;
  };
  return match;
};

function checkDestroy(description) {
  let destroy = /expend the (?<item>.*) last charge/i;
  let match = destroy.exec(description);
  if (match && match.groups.item) {
    return true;
  } else {
    return false;
  };
};

function checkD20Destroy(description) {
  let destroy = /roll a (?<d20>d20).*destroyed/i;
  let match = destroy.exec(description);
  if (match && match.groups.d20) {
    return MAGICITEMS.DestroyCheck1D20;
  } else {
    return MAGICITEMS.DestroyCheckAlways;
  };
};

// returns the default magicitem flags
function buildMagicItemSpell(chargeType,itemSpell) {
  let consumption = (chargeType == MAGICITEMS.CHARGE_TYPE_WHOLE_ITEM) ? 1 : itemSpell.data.level;
  return {
    id: "",
    name: itemSpell.name,
    img: "",
    pack: "",
    baseLevel: itemSpell.data.level,
    level: itemSpell.data.level,
    consumption: consumption,
    upcast: itemSpell.data.level,
    upcastCost: 1
  };
};

function getItemSpells(itemId, chargeType, itemSpells) {
  let spells = {};

  for(let spellIndex=0, i=0; i<itemSpells.length; i++) {
    if (itemSpells[i].flags.vtta.dndbeyond.lookupId === itemId) {
      spells[spellIndex] = buildMagicItemSpell(chargeType,itemSpells[i]);
      spellIndex++;
    };
  };

  return spells;
}

function createDefaultItem() {
  return {
    enabled: true,
    charges: 0,
    chargeType: MAGICITEMS.CHARGE_TYPE_WHOLE_ITEM, // c1 charge whole item, c2 charge per spells
    rechargeable: false,
    recharge: 0, // recharge amount/formula
    rechargeType: MAGICITEMS.FORMULA_RECHARGE, //t1 fixed amount, t2 formula
    rechargeUnit: '', // r1 daily, r2 dawn, r3 sunset, r4vshort rest, r5 long rest
    destroy: false, // destroy on depleted? 
    destroyCheck: MAGICITEMS.DestroyCheckAlways, // d1 always, 1d20
    spells: {},
    feats: {},
    tables: {}
  };
};

export default function parseMagicItem(data, character, item, itemSpells) {
  // this checks to see if the magicitems module is present
  // https://gitlab.com/riccisi/foundryvtt-magic-items/
  // if so it loads and attempts to get as much data as possible for it

  if (data.definition.magic && utils.serverFileExists(magicItemsPath)) {
    // default magicitem data
    let magicItem = createDefaultItem();

    if (data.limitedUse) {
      // if the item is x per spell
      let perSpells = getPerSpells(data.limitedUse.resetTypeDescription);
      if (perSpells) {
        magicItem.charges = perSpells;
        magicItem.chargeType = MAGICITEMS.CHARGE_TYPE_WHOLE_ITEM;
        magicItem.recharge = perSpells;
        magicItem.rechargeUnit = MAGICITEMS.DAILY;
        magicItem.rechargeable = true;
        magicItem.rechargeType = MAGICITEMS.NUMERIC_RECHARGE;
      } else {
        magicItem.charges = data.limitedUse.maxUses;
        magicItem.chargeType = MAGICITEMS.CHARGE_TYPE_PER_SPELL;

        magicItem.recharge = getRechargeFormula(
          data.limitedUse.resetTypeDescription, magicItem.charges
        );

        if (data.limitedUse.resetType) {
          magicItem.rechargeUnit = DICTIONARY.magicitems.rechargeUnits.find(
            reset => reset.id == data.limitedUse.resetType
          ).value;
        };
        magicItem.rechargeable = true;
      };

      magicItem.destroy = checkDestroy(data.limitedUse.resetTypeDescription);
      magicItem.destroyCheck = checkD20Destroy(data.limitedUse.resetTypeDescription);
    };

    magicItem.spells = getItemSpells(data.definition.id, magicItem.chargeType, itemSpells);

    return magicItem;
    
  } else {
    return {
      enabled: false
    };
  };
};
