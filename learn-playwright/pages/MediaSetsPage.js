// POM for the Library → Media Sets area and the create form.
export class MediaSetsPage {
  constructor(page) {
    this.page = page;
    this.searchBox = page.getByPlaceholder('Search...');
    this.createButton = page.getByRole('button', { name: 'Create Media Set' });
    this.nameInput = page.getByPlaceholder('Media set name');
    this.descInput = page.getByPlaceholder('Description (optional)');
    this.submitCreate = page.getByRole('button', { name: 'Create', exact: true });
    this.totalLabel = page.locator('text=/Total - \\d+/');
  }

  async gotoMediaSetsTab() {
    await this.page.goto('/library?tab=mediaSets');
  }

  async gotoCreate() {
    await this.page.goto('/library/mediaset/create');
  }

  // A media-set card by its visible name.
  card(name) {
    return this.page.locator('.ms-set-card', { hasText: name });
  }

  // Type into the search box (folder-scoped, debounced server search).
  async search(term) {
    await this.searchBox.click();
    await this.searchBox.fill(term);
  }
}
