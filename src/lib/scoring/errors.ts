/** Programming errors in scoring input (not problems with user data). */
export class ScoringInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoringInputError";
  }
}
