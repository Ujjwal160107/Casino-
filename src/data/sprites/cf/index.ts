import type { PixelSprite } from "../types";
import { cfCrest1 } from "./crest_1";
import { cfCrest2 } from "./crest_2";
import { cfCrest3 } from "./crest_3";
import { cfCrest4 } from "./crest_4";
import { cfCaper } from "./caper";
import { cfVault } from "./vault";
import { cfWar } from "./war";
import { cfRoleMastermind } from "./role_mastermind";
import { cfRoleLookout } from "./role_lookout";
import { cfRoleSafecracker } from "./role_safecracker";
import { cfRoleDriver } from "./role_driver";
import { cfRoleMuscle } from "./role_muscle";
import { cfRoleHacker } from "./role_hacker";
import { cfRankBoss } from "./rank_boss";
import { cfRankUnderboss } from "./rank_underboss";
import { cfRankCapo } from "./rank_capo";
import { cfRankSoldier } from "./rank_soldier";
import { cfRankAssociate } from "./rank_associate";
import { cfTurfCorner } from "./turf_corner";
import { cfTurfDistrict } from "./turf_district";
import { cfTurfCrown } from "./turf_crown";
import { cfBlockDocks } from "./block_docks";
import { cfBlockMain } from "./block_main";
import { cfBlockAlleys } from "./block_alleys";

/** Crime Families icons, in PRD section 16.1 order. Each renders to src/assets/cf_<key>.png. */
export const CF_SPRITES: readonly PixelSprite[] = [
  cfCrest1,
  cfCrest2,
  cfCrest3,
  cfCrest4,
  cfCaper,
  cfVault,
  cfWar,
  cfRoleMastermind,
  cfRoleLookout,
  cfRoleSafecracker,
  cfRoleDriver,
  cfRoleMuscle,
  cfRoleHacker,
  cfRankBoss,
  cfRankUnderboss,
  cfRankCapo,
  cfRankSoldier,
  cfRankAssociate,
  cfTurfCorner,
  cfTurfDistrict,
  cfTurfCrown,
  cfBlockDocks,
  cfBlockMain,
  cfBlockAlleys,
];
