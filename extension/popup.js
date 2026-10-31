import { SITE } from './share.js';

const tools = await (await fetch('tools.json')).json();
const search = document.getElementById('search');
const list = document.getElementById('list');

function render() {
  const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
  const found = tools.filter((t) => words.every((w) => `${t.name} ${t.description} ${t.path}`.toLowerCase().includes(w)));
  list.replaceChildren(
    ...found.map((t, i) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `${SITE}/${t.path}`;
      a.target = '_blank';
      a.textContent = t.name;
      if (i === 0) a.classList.add('active');
      const span = document.createElement('span');
      span.textContent = t.description;
      a.append(span);
      li.append(a);
      return li;
    }),
  );
}

search.addEventListener('input', render);
search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') list.querySelector('a')?.click();
});
render();
