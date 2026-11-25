// Token Radar's farm plans.
//
// Every protocol gets six steps, each an action with what it costs and how long
// it takes, derived from the protocol's own record (category, chains, TVL, age)
// and never from a hand-written list of names. The same function writes the
// steps main.ts puts in board.json and the steps this page shows, so the board,
// the page and the screenshots agree by construction.
//
// Costs are honest about the chain: a transaction on Ethereum costs dollars,
// on a rollup cents, on Solana a fraction of a cent. Capital is sized to the
// protocol: a multi-billion-dollar protocol is worth a bigger position than a
// $50M one, and the hold is longer for a young protocol, whose record needs
// more snapshots to count.

const RadarFarm = (() => {
  'use strict';

  /** The first chain a protocol names, or a neutral phrase. */
  function chainOf(p) {
    return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain';
  }

  /** Gas for one transaction on a chain: what the first one costs, and a weekly one. */
  function gasFor(chain) {
    const c = (chain || '').toLowerCase();
    if (c.indexOf('ethereum') >= 0) return { first: '$3–$8', weekly: 'about $2' };
    if (c.indexOf('arbitrum') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('base') >= 0 || c.indexOf('blast') >= 0 || c.indexOf('zksync') >= 0 || c.indexOf('linea') >= 0 || c.indexOf('scroll') >= 0 || c.indexOf('mode') >= 0 || c.indexOf('fraxtal') >= 0 || c.indexOf('ink') >= 0) return { first: 'about $0.10', weekly: 'about $0.05' };
    if (c.indexOf('solana') >= 0 || c.indexOf('sui') >= 0 || c.indexOf('aptos') >= 0 || c.indexOf('movement') >= 0) return { first: 'about $0.01', weekly: 'about $0.01' };
    if (c.indexOf('bsc') >= 0 || c.indexOf('bnb') >= 0 || c.indexOf('polygon') >= 0 || c.indexOf('avalanche') >= 0 || c.indexOf('gnosis') >= 0 || c.indexOf('fantom') >= 0 || c.indexOf('sonic') >= 0 || c.indexOf('berachain') >= 0) return { first: 'about $0.20', weekly: 'about $0.10' };
    return { first: 'about $1', weekly: 'about $0.50' };
  }

  /** How much capital one farm position needs, from the protocol's own TVL. */
  function capitalFor(p) {
    if (p.tvl_usd >= 5000000000) return 500;
    if (p.tvl_usd >= 1000000000) return 250;
    if (p.tvl_usd >= 100000000) return 100;
    return 50;
  }

  /** How long to hold, from the protocol's age: a young record needs more snapshots to count. */
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  /** The category's one action, in the words a farmer can follow. */
  function actionFor(p, capital, chain) {
    const c = (p.category || '').toLowerCase();
    const name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s largest pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s main vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + " through " + name + "'s official bridge, then use one native app on the chain.";
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Spend $' + capital + ' through ' + name + "'s card or checkout on " + chain + ' and keep the receipt.';
    if (c.indexOf('governance') >= 0) return 'Lock $' + capital + ' of the governance asset in ' + name + ' and vote on one proposal.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }

  /** A step as one string: its action, then its cost and time. */
  function stepText(step) {
    let s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }

  /**
   * A protocol's farm plan: six steps, each an action with a cost and a time.
   * `p` carries the snapshot's fields plus age_days, as the board's rows do.
   */
  function farmSteps(p) {
    const chain = chainOf(p);
    const gas = gasFor(chain);
    const capital = capitalFor(p);
    const age = p.age_days === undefined ? null : p.age_days;
    const hold = holdDaysFor(age);
    return [
      {
        text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
        cost: gas.first + ' of gas for the first transaction',
        time: '5 minutes',
      },
      {
        text: actionFor(p, capital, chain),
        cost: '$' + capital + ' of capital plus ' + gas.first + ' in gas',
        time: '15 minutes to set up',
      },
      {
        text: 'Make one qualifying action each week on ' + p.name + ', such as a deposit, a borrow, a swap or a vote.',
        cost: gas.weekly + ' of gas a week',
        time: '10 minutes a week',
      },
      {
        text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.',
        cost: 'the $' + capital + ' stays in the position',
        time: hold + ' days',
      },
      {
        text: "Before you withdraw, open " + p.name + "'s own points or rewards page and claim only from the link it publishes.",
        cost: 'no fee to check, and never pay to claim',
        time: '10 minutes',
      },
      {
        text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.',
        cost: 'nothing but the log',
        time: '5 minutes',
      },
    ].map(stepText);
  }

  return { chainOf, gasFor, capitalFor, holdDaysFor, actionFor, stepText, farmSteps };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RadarFarm;
if (typeof window !== 'undefined') window.RadarFarm = RadarFarm;
