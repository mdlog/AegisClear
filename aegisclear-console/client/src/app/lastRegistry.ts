// The record's breadcrumb returns to the last registry URL, filters included (LAYOUT_SPEC breadcrumbs).
let lastSearch = "";

export const rememberRegistrySearch = (search: string) => {
  lastSearch = search;
};

export const lastRegistryUrl = () => `/channels${lastSearch}`;
