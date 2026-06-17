/* =========================================================================
 * Daily Detective — Theme Packs
 * -------------------------------------------------------------------------
 * Each theme is a swappable "skin" over the same deduction engine. Adding a
 * theme multiplies the variety of the daily puzzle without touching logic.
 *
 * Every theme defines K=4 categories, each with N=4 values:
 *   categories[0]  = anchor (the suspects)  -> subj only ("{v}")
 *   categories[1..3] need subj / pred / neg phrasing templates, where:
 *     subj : noun phrase  ("the figure seen at {v}")
 *     pred : positive verb ("was seen at {v}")  -> reads after a subject
 *     neg  : negative verb ("was not seen at {v}")
 *   Templates use a uniform "the {v}" style so values stay article-free
 *   and render cleanly in headers.
 *
 *   guilt: { cat, value } -> the suspect linked to this element is the culprit
 *   intro: short atmospheric brief shown above the board
 * ====================================================================== */
(function (root) {
  'use strict';

  var THEMES = [
    {
      id: 'thames',
      title: 'Fog on the Thames',
      tagline: 'Gaslit London · a vanished royal courier',
      intro: 'London lies hushed beneath a shroud of fog. A royal courier has vanished along the river’s edge — and with him a sealed folio said to topple ministries. Four familiar silhouettes were seen in the mist. One of them is hiding behind a Cover‑up.',
      avatars: ['🎩', '🧥', '🕵️', '👒'],
      roles: ['a society gentleman', 'a dockside trader', 'a Yard inspector', 'a lady of the court'],
      guilt: { cat: 3, value: 3 }, // motive = Cover-up
      flavor: {
        search: ['Among the fog-damp stones of {place}, something catches your eye —',
          'You work {place} by lantern-light and turn up a detail —',
          '{place} keeps its secrets poorly tonight —'],
        question: ['You corner {who} in the gaslight; after a pause —',
          '{who} dabs at a brow, then lets something slip —',
          'Pressed hard, {who} gives you this —']
      },
      categories: [
        { id: 'suspect', label: 'Suspect', values: ['Harper', 'Lin', 'Doyle', 'Sutton'], subj: '{v}' },
        { id: 'location', label: 'Location', values: ['Duke Street', 'River Pier', 'the Museum', 'the Tea Room'],
          subj: 'the figure seen at {v}', pred: 'was seen at {v}', neg: 'was not at {v}' },
        { id: 'method', label: 'Method', values: ['Parcel Swap', 'Key Lift', 'Disguise', 'Inside Job'],
          subj: 'whoever pulled off the {v}', pred: 'pulled off the {v}', neg: 'did not pull off the {v}' },
        { id: 'motive', label: 'Motive', values: ['Debt', 'Jealousy', 'Greed', 'Cover-up'],
          subj: 'the suspect driven by {v}', pred: 'acted out of {v}', neg: 'was not driven by {v}' }
      ]
    },
    {
      id: 'noir',
      title: 'The Long Goodbye',
      tagline: '1940s Los Angeles · a studio fixer’s last night',
      intro: 'Rain on Sunset, neon bleeding into the gutters. A studio fixer turned up dead and a reel of someone’s secrets is missing. Four players from the back lots had reasons to be there. One of them was just covering their tracks.',
      avatars: ['🕵️', '💃', '🎙️', '🚬'],
      roles: ['a private eye', 'a fading starlet', 'a radio man', 'a studio fixer'],
      guilt: { cat: 3, value: 3 }, // motive = Cover-up
      flavor: {
        search: ['You toss {place} while the rain hammers the glass —',
          'Under the neon at {place}, something doesn’t sit right —',
          '{place} coughs up a detail you can use —'],
        question: ['You lean on {who} until they crack —',
          '{who} lights a cigarette and talks through the smoke —',
          '{who} won’t meet your eye, but says —']
      },
      categories: [
        { id: 'suspect', label: 'Suspect', values: ['Marlowe', 'Vance', 'Reyes', 'Calloway'], subj: '{v}' },
        { id: 'location', label: 'Location', values: ['the Lot', 'Chinatown', 'the Pier', 'the Bar'],
          subj: 'the one spotted at {v}', pred: 'was spotted at {v}', neg: 'never went to {v}' },
        { id: 'method', label: 'Method', values: ['Blackmail', 'Setup', 'Bribe', 'Frame-up'],
          subj: 'whoever worked the {v}', pred: 'worked the {v}', neg: 'did not work the {v}' },
        { id: 'motive', label: 'Motive', values: ['Money', 'Revenge', 'Love', 'Cover-up'],
          subj: 'the one acting for {v}', pred: 'did it for {v}', neg: 'was not in it for {v}' }
      ]
    },
    {
      id: 'orbit',
      title: 'Silence on Station Kepler',
      tagline: 'Orbital research station · a sabotaged airlock',
      intro: 'Aboard Station Kepler, the comms went dark for eleven minutes and the research core was wiped. Four crew were awake during the blackout. The logs were scrubbed by someone covering their trail.',
      avatars: ['🧑🏾‍🚀', '🧑‍🚀', '🧑🏽‍🔬', '🧑🏼‍✈️'],
      roles: ['mission commander', 'systems engineer', 'lead researcher', 'flight officer'],
      guilt: { cat: 3, value: 3 }, // motive = Cover-up
      flavor: {
        search: ['Telemetry from {place} flags an anomaly —',
          'You pull the logs from {place} —',
          'A sensor sweep of {place} returns something —'],
        question: ['You question {who} over the comm —',
          '{who} checks the manifest, then admits —',
          '{who} hesitates on the channel, then —']
      },
      categories: [
        { id: 'suspect', label: 'Crew', values: ['Okafor', 'Petrov', 'Singh', 'Bauer'], subj: '{v}' },
        { id: 'location', label: 'Module', values: ['the Lab', 'the Galley', 'the Airlock', 'the Bridge'],
          subj: 'whoever was in {v}', pred: 'was in {v}', neg: 'was not in {v}' },
        { id: 'method', label: 'Method', values: ['Power Cut', 'Data Wipe', 'Vent Hack', 'Lockout'],
          subj: 'whoever ran the {v}', pred: 'ran the {v}', neg: 'did not run the {v}' },
        { id: 'motive', label: 'Motive', values: ['Sabotage', 'Mutiny', 'Profit', 'Cover-up'],
          subj: 'the one driven by {v}', pred: 'acted from {v}', neg: 'was not driven by {v}' }
      ]
    },
    {
      id: 'manor',
      title: 'A Death at Ravenswood',
      tagline: 'English country manor · the will has gone missing',
      intro: 'A storm has cut off Ravenswood Hall, and the late lord’s will has vanished from the study. Four guests remained after midnight, each with a story that does not quite hold. One of them is simply covering up.',
      avatars: ['🎩', '👰', '🧓', '🤵'],
      roles: ['the estranged heir', 'the late lord’s widow', 'the family solicitor', 'the head butler'],
      guilt: { cat: 3, value: 3 }, // motive = Cover-up
      flavor: {
        search: ['By candlelight you search {place} —',
          'Something in {place} sits out of place —',
          '{place} yields a quiet clue —'],
        question: ['You press {who} in the drawing-room —',
          '{who} folds their hands and confesses —',
          '{who} glances away, then offers —']
      },
      categories: [
        { id: 'suspect', label: 'Guest', values: ['Ashby', 'Crane', 'Wren', 'Holt'], subj: '{v}' },
        { id: 'location', label: 'Room', values: ['the Study', 'the Library', 'the Conservatory', 'the Cellar'],
          subj: 'the guest in {v}', pred: 'was in {v}', neg: 'was not in {v}' },
        { id: 'method', label: 'Method', values: ['Forgery', 'Poisoning', 'Theft', 'Threat'],
          subj: 'whoever resorted to the {v}', pred: 'resorted to the {v}', neg: 'did not resort to the {v}' },
        { id: 'motive', label: 'Motive', values: ['Inheritance', 'Scandal', 'Spite', 'Cover-up'],
          subj: 'the one acting from {v}', pred: 'acted from {v}', neg: 'was not moved by {v}' }
      ]
    }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = THEMES;
  root.DD_THEMES = THEMES;
})(typeof window !== 'undefined' ? window : this);
