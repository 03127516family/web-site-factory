const setExpanded = (button, expanded) => {
  button.setAttribute("aria-expanded", String(expanded));
};

document.querySelectorAll("[data-menu-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const menu = button.nextElementSibling;
    const willOpen = menu.hidden;

    document.querySelectorAll("[data-menu-toggle]").forEach((otherButton) => {
      if (otherButton !== button) {
        otherButton.nextElementSibling.hidden = true;
        setExpanded(otherButton, false);
      }
    });

    menu.hidden = !willOpen;
    setExpanded(button, willOpen);
  });
});

const mobileToggle = document.querySelector(".mobile-menu-toggle");
const primaryMenu = document.querySelector(".primary-menu");

mobileToggle?.addEventListener("click", () => {
  const willOpen = !primaryMenu.classList.contains("is-open");
  primaryMenu.classList.toggle("is-open", willOpen);
  setExpanded(mobileToggle, willOpen);
});

const searchToggle = document.querySelector(".search-toggle");
const searchForm = document.querySelector(".site-search");

searchToggle?.addEventListener("click", () => {
  const willOpen = searchForm.hidden;
  searchForm.hidden = !willOpen;
  setExpanded(searchToggle, willOpen);
  if (willOpen) searchForm.querySelector("input")?.focus();
});

const languagePicker = document.querySelector("[data-language-picker]");
const languageToggle = languagePicker?.querySelector("button");
const languageMenu = languagePicker?.querySelector(".language-picker__menu");

languageToggle?.addEventListener("click", () => {
  const willOpen = languageMenu.hidden;
  languageMenu.hidden = !willOpen;
  setExpanded(languageToggle, willOpen);
});

document.querySelector("[data-subscribe-form]")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const status = document.querySelector("[data-subscribe-status]");
  status.hidden = false;
});
