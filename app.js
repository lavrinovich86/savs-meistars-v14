const menu = document.querySelector('.menu');
const navigation = document.querySelector('#navigation');
function closeMenu() {
  navigation.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'Atvērt izvēlni');
}
menu.addEventListener('click', () => {
  const isOpen = navigation.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(isOpen));
  menu.setAttribute('aria-label', isOpen ? 'Aizvērt izvēlni' : 'Atvērt izvēlni');
});
navigation.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && navigation.classList.contains('open')) { closeMenu(); menu.focus(); } });
document.addEventListener('click', event => { if (!event.target.closest('.header')) closeMenu(); });
document.querySelector('#year').textContent = new Date().getFullYear();

const form = document.querySelector('#project-form');
document.querySelectorAll('[data-service]').forEach(link => {
  link.addEventListener('click', () => { form.elements.service.value = link.dataset.service; });
});
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const subject = 'Projekta pieteikums: ' + (data.get('service') || 'Jauna iecere');
  const body = `Labdien!\n\n${data.get('message')}\n\nPakalpojums: ${data.get('service') || 'Precizēsim sarunā'}\nVārds: ${data.get('name')}\nTālrunis: ${data.get('phone') || 'Nav norādīts'}\nE-pasts: ${data.get('email')}`;
  window.location.href = `mailto:info@savs.lv?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  document.querySelector('#form-status').textContent = 'Vēstule ir sagatavota atvēršanai jūsu e-pasta programmā. Ja tā neatveras, rakstiet uz info@savs.lv (tāmēm — tames@savs.lv) vai zvaniet +371 29 354 519. Pieteikums vēl nav nosūtīts.';
});

const lightbox = document.querySelector('.lightbox');
document.querySelectorAll('.project-image').forEach(button => {
  button.addEventListener('click', () => {
    const source = button.querySelector('img');
    const enlarged = lightbox.querySelector('img');
    enlarged.src = source.currentSrc || source.src;
    enlarged.alt = source.alt;
    document.querySelector('#photo-caption').textContent = button.closest('figure').querySelector('figcaption').textContent;
    lightbox.showModal();
  });
});
lightbox.querySelector('.lightbox-close').addEventListener('click', () => lightbox.close());
lightbox.addEventListener('click', event => {
  const bounds = lightbox.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) lightbox.close();
});
const motionToggle = document.querySelector('.motion-toggle');
motionToggle.addEventListener('click', () => {
  const paused = document.querySelector('.partner-marquee').classList.toggle('paused');
  motionToggle.setAttribute('aria-pressed', String(paused));
  motionToggle.textContent = paused ? 'Turpināt lentu' : 'Apturēt lentu';
});
matchMedia('(min-width: 801px)').addEventListener('change', closeMenu);
