// The worst case of every turf screen (spec 13.3 S16–S21 and the S25 war
// card), appended to crimeFamilyWorstCases() and read by both layout tests and
// src/scripts/checkV2Payloads.ts. Built from literal views: no DB. Families
// have 24-character names and 4-character tags, every racket is owned and in
// a live war, and amounts are near MAX_SAFE_BALANCE.
import { MAX_SAFE_BALANCE } from "../../utils/economyConfig";
import { RACKETS, WAR_BLOCKS } from "../../data/crimeFamilyCatalog";
import type { RacketDetailView, TurfMapView, TurfRacketLine, WarBoardView } from "../../services/crimeFamily/views";
import {
  buildHitCall, buildHitResult, buildRacketDetail, buildScoutReport, buildTurfMap, buildWarBoard, buildWarCard, buildWarResult,
} from "../../ui/crimeFamily/turfScreens";
import type { CfPayload } from "../../ui/crimeFamily/kit";
import { jumpLink } from "../../ui/crimeFamily/post";

const OWNER = "12345678901234567890";
const WAR_ID = "65f0000000000000000000ab";
const HIT_ID = "65f0000000000000000000ac";
const BIG = MAX_SAFE_BALANCE - 1;
const SOON = () => new Date(Date.now() + 3_600_000);
const label = (i: number) => `[WX${String(i).padStart(2, "0")}] Velvet Ante Syndicate Ok`; // 24-character name
const HITTERS = (base: number) => Array.from({ length: 5 }, (_, i) => ({ userId: `9876543210987654${base + i}`, points: 9_999 - i }));

function line(i: number): TurfRacketLine {
  const r = RACKETS[i];
  return {
    key: r.key, name: r.name, class: r.class, income: r.incomePerCycle, ownerFamilyId: `65f00000000000000000000${i}`,
    ownerLabel: label(i), strikes: 2,
    war: { id: WAR_ID, status: "BIDDING", topBid: BIG, topBidderLabel: label(i + 10), bidClosesAt: SOON(), startsAt: SOON() },
    nextWarAt: SOON(), bidding: { phase: "OPEN", nextOpensAt: SOON() },
  };
}

function mapView(): TurfMapView {
  return { rackets: RACKETS.map((_, i) => line(i)), nextWar: { racketName: RACKETS[6].name, startsAt: SOON() } };
}

function detailView(): RacketDetailView {
  return {
    line: line(6), floor: 4_550_000, minBid: BIG, minFamilyLevel: 4, viewerIsOfficer: true, canBid: false,
    blockers: ["Racket cap reached (3/3 held or bid).", "Clear dues arrears first."],
  };
}

function boardView(blackout: boolean): WarBoardView {
  const score = { atk: 9_999, def: 9_999 };
  return {
    warId: WAR_ID, racketKey: "union_kickbacks", racketName: "Construction Union Kickbacks", racketClass: "DISTRICT",
    startsAt: new Date(), endsAt: SOON(),
    attacker: { familyId: "65f0000000000000000000a1", label: label(1) }, defender: { familyId: "65f0000000000000000000a2", label: label(2) },
    scores: { docks: score, main: score, alleys: score }, hits: { atk: 72, def: 72 },
    top: { atk: HITTERS(3400), def: HITTERS(3500) }, blackout,
  };
}

export function turfWorstCases(): { label: string; max: number; payload: CfPayload }[] {
  const docks = WAR_BLOCKS[0];
  return [
    { label: "S16 turf map (10 owned rackets, live bids)", max: 14, payload: buildTurfMap(OWNER, mapView()) },
    { label: "S17 racket detail (blocked)", max: 11, payload: buildRacketDetail(OWNER, detailView()) },
    { label: "S18 war board", max: 13, payload: buildWarBoard(boardView(false), "send") },
    { label: "S18 war board (blackout)", max: 13, payload: buildWarBoard(boardView(true), "send") },
    {
      label: "S19 hit call", max: 8,
      payload: buildHitCall({ hitId: HIT_ID, block: docks.key, deadline: SOON(), slotEndsAt: SOON(), approaches: docks.approaches }, docks.name),
    },
    { label: "S19 hit result", max: 2, payload: buildHitResult("Hit! +12 to Back Alleys.") },
    { label: "S20 scout report", max: 3, payload: buildScoutReport({ warId: WAR_ID, block: "alleys", approach: "Laundry Line", slotEndsAt: SOON() }, "Back Alleys") },
    {
      label: "S21 war result (capture over cap)", max: 6,
      payload: buildWarResult({
        board: boardView(false), outcome: "CAPTURED", overCap: true,
        xp: [{ label: label(1), xp: 999_999 }, { label: label(2), xp: 999_999 }], heated: 12,
      }, "keep"),
    },
    { label: "S25 war card", max: 7, payload: buildWarCard({ warId: WAR_ID, racketName: "Construction Union Kickbacks", endsAt: SOON(), jumpUrl: jumpLink(OWNER, OWNER, OWNER) }) },
  ];
}
