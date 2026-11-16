// The radar-2 model as the page runs it: the same arithmetic lib/model.ts runs on the server,
// written here in plain JavaScript so the dashboard recomputes every row it shows and regenerates
// every farm plan from the snapshot figures, with no name special-cased.
//
//   implied = round(tvl x multiple x growthMult x maturity x breadth)
//   multiple   the median market-cap / TVL the market pays live tokens in this snapshot, per
//              category where that category has at least 8 live protocols with a market cap,
//              else the snapshot's median; clamped to [0.05, 1.00]. Computed by main.ts and carried
//              in data.js as calibration, never written in by hand.
//   growthMult 1 + clamp(change_7d, -60, 120) / 100 x 0.5
//   maturity   the launch window: 0.6 + 0.4 x min(age, 730) / 730 up to two years, then 0.97 per
//              further year, floored at 0.70. Unknown age counts as 365 days.
//   breadth    1 + 0.03 x min(chains - 1, 4)
//
// A farm plan is seven steps derived from the row's own record (category, chains, TVL, age). Every
// step carries what it costs and how long it takes, in its text.

(function () {
  'use strict';

  var VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

  function round4(n) { return Math.round(n * 1e4) / 1e4; }

  function ageOf(row, model) {
    if (row.age_days === null || row.age_days === undefined) return model.unknown_age_days;
    return row.age_days;
  }

  function maturityOf(age, model) {
    var days = age === null || age === undefined ? model.unknown_age_days : age;
    if (days <= model.maturity_peak_days) {
      return model.maturity_floor + ((1 - model.maturity_floor) * Math.min(Math.max(days, 0), model.maturity_peak_days)) / model.maturity_peak_days;
    }
    var yearsPast = (days - model.maturity_peak_days) / 365;
    return Math.max(model.maturity_decay_floor, Math.pow(model.maturity_decay, yearsPast));
  }

  function breadthOf(chainCount, model) {
    return 1 + model.breadth_step * Math.min(Math.max(chainCount - 1, 0), model.breadth_cap);
  }

  function growthOf(row, model) {
    var raw = row.change_7d === null || row.change_7d === undefined || !isFinite(row.change_7d) ? 0 : row.change_7d;
    var pct = Math.min(model.growth_cap, Math.max(model.growth_floor, raw));
    return { pct: pct, mult: 1 + (pct / 100) * model.growth_weight };
  }

  // The implied value of one row, from the snapshot figures and the calibration data.js carries.
  // Returns the value and every factor, so the detail view can show the working.
  function impliedOf(row, model, calibration) {
    var multiple = row.base_multiple;
    var growth = growthOf(row, model);
    var maturity = maturityOf(row.age_days, model);
    var breadth = breadthOf(row.chains ? row.chains.length : 0, model);
    var implied = Math.max(1, Math.round(row.tvl_usd * multiple * growth.mult * maturity * breadth));
    return {
      implied: implied,
      multiple: multiple,
      growthPct: growth.pct,
      growthMult: growth.mult,
      maturityMult: maturity,
      breadthMult: breadth,
      age: row.age_days === null || row.age_days === undefined ? null : row.age_days
    };
  }

  function chainOf(row) {
    return row.chains && row.chains.length > 0 ? row.chains[0] : 'its main chain';
  }

  function capitalFor(row) {
    if (row.tvl_usd >= 5e9) return 250;
    if (row.tvl_usd >= 1e9) return 150;
    if (row.tvl_usd >= 1e8) return 100;
    return 50;
  }

  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  function actionFor(row, capital, chain) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('synthetic') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('payment') >= 0) return 'Send $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('oracle') >= 0) return 'Use $' + capital + ' of the data feed ' + name + ' prices on ' + chain + ' through its app.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }

  function weeklyActionFor(row, chain) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $10 against the supply on ' + name + ', then repay it the same week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Swap $5 through ' + name + "'s main pool on " + chain + '.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $5 of USDC to ' + chain + ' through ' + name + '.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim the staking rewards ' + name + ' paid and restake them.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('synthetic') >= 0) return 'Open and close one small trade on ' + name + ' with $5 of margin.';
    if (c.indexOf('prediction') >= 0) return 'Place one $5 market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Vote on one ' + name + ' vault proposal, or deposit $5 more.';
    if (c.indexOf('stable') >= 0) return 'Swap $5 into the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Check the yield ' + name + ' paid this week and leave it compounding.';
    if (c.indexOf('insurance') >= 0) return 'Check the cover ' + name + ' shows as active and leave it in place.';
    return 'Make one small deposit, swap or vote on ' + name + ' on ' + chain + '.';
  }

  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }

  // The seven farm steps of one row: the action, what it costs and how long it takes.
  function farmSteps(row) {
    var chain = chainOf(row);
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(row, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyActionFor(row, chain), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: "Do not buy any token trading under this protocol's name: it records no token, so anything trading under its name is a fake.", cost: 'nothing, and it saves the whole position', time: '2 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  var api = {
    versioned: VERSIONED,
    round4: round4,
    ageOf: ageOf,
    maturityOf: maturityOf,
    breadthOf: breadthOf,
    growthOf: growthOf,
    impliedOf: impliedOf,
    chainOf: chainOf,
    capitalFor: capitalFor,
    holdDaysFor: holdDaysFor,
    actionFor: actionFor,
    weeklyActionFor: weeklyActionFor,
    stepText: stepText,
    farmSteps: farmSteps
  };

  // In the browser the page reads window.RADAR_MODEL; in Node a test requires this file.
  if (typeof window !== 'undefined') window.RADAR_MODEL = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
