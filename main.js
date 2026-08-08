// Small shared UI behaviour: mobile nav toggle + active link highlighting.
(
  function main() {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');

  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }
  const current = document.body.dataset.page;
  document.querySelectorAll('.nav-links a').forEach((a) => {
    if (a.dataset.page === current) a.classList.add('active');
  });
}
)

();
