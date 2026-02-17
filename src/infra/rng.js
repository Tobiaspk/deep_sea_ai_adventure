/** Dice helpers – Deep Sea Adventure uses two dice each showing 1-2-3-1-2-3. */

/** Roll a single die (1, 2, or 3 with equal probability). */
export const rollDie = () => Math.floor(Math.random() * 3) + 1;

/** Roll two dice and return { die1, die2, total }. */
export const rollDice = () => {
  const die1 = rollDie();
  const die2 = rollDie();
  return { die1, die2, total: die1 + die2 };
};
