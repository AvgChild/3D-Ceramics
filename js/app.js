const grid=document.getElementById('grid');const empty=document.getElementById('empty');const search=document.getElementById('search');const tagFilter=document.getElementById('tagFilter');const cardTpl=document.getElementById('card-tpl');let items=[];let tags=new Set();async function loadCatalog(){const res=await fetch('catalog/catalog.json',{cache:'no-store'});items=await res.json();tags=new Set();items.forEach(i=>(i.tags||[]).forEach(t=>tags.add(t)));renderTagOptions();render();}
function renderTagOptions(){const current=tagFilter.value||'';tagFilter.innerHTML='<option value="">All tags</option>'+[...tags].sort().map(t=>`<option value="${t}">${t}</option>`).join('');tagFilter.value=current;}
function passesFilters(item){const q=search.value.trim().toLowerCase();const tag=tagFilter.value;const hay=(item.title+' '+(item.description||'')+' '+(item.tags||[]).join(' ')).toLowerCase();const searchOk=!q||hay.includes(q);const tagOk=!tag||(item.tags||[]).includes(tag);return searchOk&&tagOk;}
function shuffleArray(array){const shuffled=[...array];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}return shuffled;}
function render(shouldShuffle=false){grid.innerHTML='';let filtered=items.filter(passesFilters);if(shouldShuffle){filtered=shuffleArray(filtered);}empty.hidden=filtered.length>0;filtered.forEach(item=>{const a=cardTpl.content.firstElementChild.cloneNode(true);a.href=`viewer.html?id=${encodeURIComponent(item.id)}`;const img=a.querySelector('img');img.src=item.thumb;img.alt=item.title;a.querySelector('.title').textContent=item.title;a.querySelector('.tags').textContent=(item.tags||[]).join(' · ');grid.appendChild(a);});}
function shuffleGrid(){render(true);}
search.addEventListener('input',()=>render(false));tagFilter.addEventListener('change',()=>render(false));document.getElementById('shuffleBtn').addEventListener('click',shuffleGrid);

// Educational disclaimer modal
function showDisclaimer() {
  const modal = document.getElementById('disclaimerModal');
  const closeBtn = document.getElementById('closeDisclaimer');

  // Show modal on page load
  setTimeout(() => {
    modal.classList.add('show');
  }, 500);

  // Close modal when button is clicked
  closeBtn.addEventListener('click', () => {
    modal.classList.remove('show');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  });

  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
      setTimeout(() => {
        modal.style.display = 'none';
      }, 300);
    }
  });
}

loadCatalog().then(()=>render(true));
showDisclaimer();