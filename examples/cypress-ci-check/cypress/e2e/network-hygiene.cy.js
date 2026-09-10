// The actual point of this example: collectIssues()'s array is a plain assertable value, so a
// duplicate-fetch regression can fail a build instead of only printing a console warning nobody
// was watching. Two tests: one proves silence on a clean interaction, one proves a real
// regression actually gets caught — a suite where every test just asserts "zero issues" would
// also pass if collectIssues() were silently broken, so the second test is what makes this a
// real check rather than a tautology.

describe('network hygiene', () => {
  it('reports zero issues for the correct flow', () => {
    cy.visit('/');
    cy.get('#clean').click();
    cy.window().its('__wdyf').its('issues').should('have.length', 0);
  });

  it('catches a real duplicate-inflight regression', () => {
    cy.visit('/');
    cy.get('#buggy').click();
    cy.window()
      .its('__wdyf')
      .its('issues')
      .should('have.length.greaterThan', 0)
      .its(0)
      .its('kind')
      .should('eq', 'duplicate-inflight');
  });
});
