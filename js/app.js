const grid=document.getElementById('grid');const empty=document.getElementById('empty');const search=document.getElementById('search');const tagFilter=document.getElementById('tagFilter');const cardTpl=document.getElementById('card-tpl');
const gridModeBtn=document.getElementById('gridModeBtn');
const pileModeBtn=document.getElementById('pileModeBtn');
let items=[];let tags=new Set();
let currentMode='grid'; // 'grid' or 'pile'

// Physics engine variables
let cards = [];
let draggedCard = null;
let mouseX = 0, mouseY = 0;
let animationFrame;

class PhysicsCard {
  constructor(element, item, index) {
    this.element = element;
    this.item = item;
    this.x = Math.random() * (window.innerWidth - 250);
    this.y = -300 - (index * 50); // Start above viewport, staggered
    this.vx = (Math.random() - 0.5) * 5; // horizontal velocity
    this.vy = 0; // vertical velocity
    this.rotation = Math.random() * 360;
    this.rotationSpeed = (Math.random() - 0.5) * 5;
    this.width = 220;
    this.height = 280;
    this.isDragging = false;
    this.zIndex = index;
    this.isSettled = false;

    this.setupElement();
    this.setupInteractions();
  }

  setupElement() {
    this.element.style.position = 'fixed';
    this.element.style.width = this.width + 'px';
    this.element.style.cursor = 'grab';
    this.element.style.userSelect = 'none';
    this.element.style.touchAction = 'none';
    this.updateTransform();
  }

  setupInteractions() {
    // Prevent default link behavior
    this.element.addEventListener('click', (e) => {
      e.preventDefault();
    });

    // Double-click to navigate
    this.element.addEventListener('dblclick', (e) => {
      e.preventDefault();
      window.location.href = `viewer.html?id=${encodeURIComponent(this.item.id)}`;
    });

    // Mouse drag
    this.element.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.startDrag(e.clientX, e.clientY);
    });

    // Touch drag
    this.element.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.startDrag(touch.clientX, touch.clientY);
    });
  }

  startDrag(x, y) {
    this.isDragging = true;
    draggedCard = this;
    this.element.style.cursor = 'grabbing';
    this.offsetX = x - this.x;
    this.offsetY = y - this.y;
    this.vy = 0;
    this.vx = 0;

    // Bring to front
    this.zIndex = Math.max(...cards.map(c => c.zIndex)) + 1;
    this.element.style.zIndex = this.zIndex;
  }

  drag(x, y) {
    if (this.isDragging) {
      this.x = x - this.offsetX;
      this.y = y - this.offsetY;
      this.updateTransform();
    }
  }

  stopDrag() {
    if (this.isDragging) {
      this.isDragging = false;
      this.element.style.cursor = 'grab';
      // Add slight velocity when released
      this.vy = 2;
    }
  }

  update() {
    if (this.isDragging) return;

    const gravity = 0.5;
    const friction = 0.98;
    const groundY = window.innerHeight - this.height - 20;

    // Apply gravity
    this.vy += gravity;

    // Apply velocity
    this.x += this.vx;
    this.y += this.vy;

    // Apply friction
    this.vx *= friction;

    // Rotation while falling
    if (!this.isSettled) {
      this.rotation += this.rotationSpeed;
    }

    // Collision with ground
    if (this.y >= groundY) {
      this.y = groundY;
      this.vy *= -0.4; // Bounce
      this.rotationSpeed *= 0.8;

      if (Math.abs(this.vy) < 0.5) {
        this.vy = 0;
        this.isSettled = true;
        this.rotationSpeed = 0;
        // Settle to nearest slight angle
        this.rotation = Math.round(this.rotation / 15) * 15;
      }
    }

    // Collision with walls
    if (this.x < 0) {
      this.x = 0;
      this.vx *= -0.5;
    }
    if (this.x > window.innerWidth - this.width) {
      this.x = window.innerWidth - this.width;
      this.vx *= -0.5;
    }

    this.updateTransform();
  }

  updateTransform() {
    this.element.style.transform = `translate(${this.x}px, ${this.y}px) rotate(${this.rotation}deg)`;
    this.element.style.zIndex = this.zIndex;
  }
}

async function loadCatalog(){const res=await fetch('catalog/catalog.json',{cache:'no-store'});items=await res.json();tags=new Set();items.forEach(i=>(i.tags||[]).forEach(t=>tags.add(t)));renderTagOptions();render();}
function renderTagOptions(){const current=tagFilter.value||'';tagFilter.innerHTML='<option value="">All tags</option>'+[...tags].sort().map(t=>`<option value="${t}">${t}</option>`).join('');tagFilter.value=current;}
function passesFilters(item){const q=search.value.trim().toLowerCase();const tag=tagFilter.value;const hay=(item.title+' '+(item.description||'')+' '+(item.tags||[]).join(' ')).toLowerCase();const searchOk=!q||hay.includes(q);const tagOk=!tag||(item.tags||[]).includes(tag);return searchOk&&tagOk;}
function shuffleArray(array){const shuffled=[...array];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}return shuffled;}

function render(shouldShuffle=false){
  if (currentMode === 'grid') {
    renderGrid(shouldShuffle);
  } else {
    renderPile();
  }
}

function renderGrid(shouldShuffle=false) {
  // Stop animation if running
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  // Clean up pile mode cards
  cards.forEach(card => card.element.remove());
  cards = [];

  // Show grid, enable scrolling
  grid.style.display = 'grid';
  document.body.style.overflow = '';

  grid.innerHTML='';
  let filtered=items.filter(passesFilters);
  if(shouldShuffle){filtered=shuffleArray(filtered);}
  empty.hidden=filtered.length>0;

  filtered.forEach(item=>{
    const a=cardTpl.content.firstElementChild.cloneNode(true);
    a.href=`viewer.html?id=${encodeURIComponent(item.id)}`;
    const img=a.querySelector('img');
    img.src=item.thumb;
    img.alt=item.title;
    a.querySelector('.title').textContent=item.title;
    a.querySelector('.tags').textContent=(item.tags||[]).join(' · ');
    grid.appendChild(a);
  });
}

function renderPile() {
  // Stop current animation
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
  }

  // Clear existing cards
  cards.forEach(card => card.element.remove());
  cards = [];

  // Hide grid, disable scrolling
  grid.innerHTML='';
  grid.style.display = 'none';
  document.body.style.overflow = 'hidden';

  let filtered=items.filter(passesFilters);
  empty.hidden=filtered.length>0;

  // Create physics cards
  filtered.forEach((item, index)=>{
    const a=cardTpl.content.firstElementChild.cloneNode(true);
    a.href=`viewer.html?id=${encodeURIComponent(item.id)}`;
    const img=a.querySelector('img');
    img.src=item.thumb;
    img.alt=item.title;
    a.querySelector('.title').textContent=item.title;
    a.querySelector('.tags').textContent=(item.tags||[]).join(' · ');
    document.body.appendChild(a);

    const card = new PhysicsCard(a, item, index);
    cards.push(card);
  });

  // Start animation loop
  animate();
}

function animate() {
  cards.forEach(card => card.update());
  animationFrame = requestAnimationFrame(animate);
}

function switchToGridMode() {
  currentMode = 'grid';
  gridModeBtn.style.display = 'none';
  pileModeBtn.style.display = 'inline-block';
  render();
}

function switchToPileMode() {
  currentMode = 'pile';
  gridModeBtn.style.display = 'inline-block';
  pileModeBtn.style.display = 'none';
  render();
}

// Global mouse/touch tracking for pile mode
document.addEventListener('mousemove', (e) => {
  if (currentMode !== 'pile') return;
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (draggedCard) {
    draggedCard.drag(mouseX, mouseY);
  }
});

document.addEventListener('touchmove', (e) => {
  if (currentMode !== 'pile') return;
  if (draggedCard) {
    const touch = e.touches[0];
    mouseX = touch.clientX;
    mouseY = touch.clientY;
    draggedCard.drag(mouseX, mouseY);
  }
});

document.addEventListener('mouseup', () => {
  if (draggedCard) {
    draggedCard.stopDrag();
    draggedCard = null;
  }
});

document.addEventListener('touchend', () => {
  if (draggedCard) {
    draggedCard.stopDrag();
    draggedCard = null;
  }
});

function shuffleGrid(){render(true);}
search.addEventListener('input',()=>render(false));
tagFilter.addEventListener('change',()=>render(false));
document.getElementById('shuffleBtn').addEventListener('click',shuffleGrid);
gridModeBtn.addEventListener('click', switchToGridMode);
pileModeBtn.addEventListener('click', switchToPileMode);

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