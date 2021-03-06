import utils from "../../../utils.js";

const SAVE_ALL = 0;
const SAVE_NONE = 2;

const CLEAN_MONSTERS = 1;
const CLEAN_ALL = 3;

/**
 * Sends a event request to Iconizer to add the correct icons
 * @param {*} names
 */
let queryIcons = (names) => {
  return new Promise((resolve, reject) => {
    let listener = (event) => {
      resolve(event.detail);
      // cleaning up
      document.removeEventListener("deliverIcon", listener);
    };

    setTimeout(() => {
      document.removeEventListener("deliverIcon", listener);
      reject("Tokenizer not responding");
    }, 500);
    document.addEventListener("deliverIcon", listener);
    document.dispatchEvent(new CustomEvent("queryIcons", { detail: { names: names } }));
  });
};

/**
 *
 * @param {[string]} spells Array of Strings or
 */
const retrieveSpells = async (spells) => {
  let compendiumName = await game.settings.get("vtta-dndbeyond", "entity-spell-compendium");
  const GET_ENTITY = true;

  const spellNames = spells.map((spell) => {
    if (typeof spell === "string") return spell;
    if (typeof spell === "object" && Object.prototype.hasOwnProperty.call(spell, "name")) return spell.name;
    return "";
  });

  return utils.queryCompendiumEntries(compendiumName, spellNames, GET_ENTITY);
};

const getCompendium = async () => {
  const compendiumName = await game.settings.get("vtta-dndbeyond", "entity-monster-compendium");
  if (compendiumName && compendiumName !== "") {
    const compendium = await game.packs.find((pack) => pack.collection === compendiumName);
    if (compendium) {
      return compendium;
    }
  }
  return undefined;
};

const addNPCToCompendium = async (npc, name) => {
  // decide wether to save it into the compendium
  if (game.settings.get("vtta-dndbeyond", "entity-import-policy") !== SAVE_NONE) {
    // update existing (1) or overwrite (0)
    const compendium = await getCompendium();
    if (compendium) {
      let index = await compendium.getIndex();
      let entity = index.find((entity) => entity.name.toLowerCase() === name.toLowerCase());
      if (entity) {
        if (SAVE_ALL) {
          const compendiumNPC = JSON.parse(JSON.stringify(npc));
          compendiumNPC.data._id = entity._id;
          await compendium.updateEntity(compendiumNPC.data);
        }
      } else {
        await compendium.createEntity(npc.data);
      }
    } else {
      console.error("Error opening compendium, check your settings"); // eslint-disable-line no-console
    }
  }
};

// we are creating the NPC here not temporary
let createNPC = async (npc, options) => {
  let icons = npc.items.map((item) => {
    return {
      name: item.name,
    };
  });
  try {
    utils.log("Querying iconizer for icons");
    icons = await queryIcons(icons);
    utils.log(icons);

    // replace the icons
    for (let item of npc.items) {
      let icon = icons.find((icon) => icon.name === item.name);
      if (icon) {
        item.img = icon.img;
      }
    }
  } catch (exception) {
    utils.log("Iconizer not responding");
  }

  // let result = await Actor5e.create(npc, options);
  // should be aliased again
  let result = await Actor.create(npc, options);

  if (npc.flags.vtta.dndbeyond.spells.length !== 0) {
    // update existing (1) or overwrite (0)
    let spells = await retrieveSpells(npc.flags.vtta.dndbeyond.spells);
    spells = spells.map((spell) => spell.data);
    await result.createEmbeddedEntity("OwnedItem", spells);
  }

  return result;
};

let buildNPC = async (data) => {
  // get the folder to add this npc into
  const folder = await utils.getFolder("npc", data.data.details.type, data.data.details.race);
  // in this instance I can't figure out how to make this safe, but the risk seems minimal.
  // eslint-disable-next-line require-atomic-updates
  data.folder = folder._id;

  // replace icons by iconizer, if available
  let icons = data.items.map((item) => {
    return {
      name: item.name,
    };
  });
  try {
    utils.log("Querying iconizer for icons");
    icons = await queryIcons(icons);
    utils.log(icons);

    // replace the icons
    for (let item of data.items) {
      let icon = icons.find((icon) => icon.name === item.name);
      if (icon) {
        item.img = icon.img;
      }
    }
  } catch (exception) {
    utils.log("Iconizer not responding");
  }

  utils.log("Importing NPC");
  // check if there is an NPC with that name in that folder already
  let npc = folder.content ? folder.content.find((actor) => actor.name === data.name) : undefined;
  if (npc) {
    utils.log("NPC exists");
    // remove the inventory of said npc
    await npc.deleteEmbeddedEntity(
      "OwnedItem",
      npc.getEmbeddedCollection("OwnedItem").map((item) => item._id)
    );
    // update items and basic data
    await npc.update(data);
    utils.log("NPC updated");
    if (data.flags.vtta.dndbeyond.spells && data.flags.vtta.dndbeyond.spells.length !== 0) {
      utils.log("Retrieving spells:");
      utils.log(data.flags.vtta.dndbeyond.spells);
      let spells = await retrieveSpells(data.flags.vtta.dndbeyond.spells);
      spells = spells.filter((spell) => spell !== null).map((spell) => spell.data);
      await npc.createEmbeddedEntity("OwnedItem", spells);
    }
  } else {
    if (data.flags.vtta.dndbeyond.img) {
      // image upload
      let filename =
        "npc-" +
        data.name
          .replace(/[^a-zA-Z]/g, "-")
          .replace(/-+/g, "-")
          .trim();

      let uploadDirectory = game.settings.get("vtta-dndbeyond", "image-upload-directory").replace(/^\/|\/$/g, "");
      // in this instance I can't figure out how to make this safe, but the risk seems minimal.
      // eslint-disable-next-line require-atomic-updates
      data.img = await utils.uploadImage(data.flags.vtta.dndbeyond.img, uploadDirectory, filename);
    }

    // create the new npc
    npc = await createNPC(data, {
      temporary: false,
      displaySheet: true,
    });
  }
  return npc;
};

const cleanUp = async (npc) => {
  // cleaning up after imports
  const cleanupAfterImport =
    game.settings.get("vtta-dndbeyond", "entity-cleanup-policy") === CLEAN_ALL ||
    game.settings.get("vtta-dndbeyond", "entity-cleanup-policy") === CLEAN_MONSTERS;

  if (cleanupAfterImport) {
    await npc.delete();
  }
};

const parseNPC = async (body) => {
  let npc = await buildNPC(body.data);
  await addNPCToCompendium(npc, body.data.name);
  await cleanUp(npc);
  return npc;
};

let addNPC = (body) => {
  return new Promise((resolve, reject) => {
    parseNPC(body)
      .then((npc) => {
        resolve(npc.data);
      })
      .catch((error) => {
        console.error(`error parsing NPC: ${error}`); // eslint-disable-line no-console
        reject(error);
      });
  });
};

export default addNPC;
