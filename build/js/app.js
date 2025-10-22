const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const search = document.getElementById('search');
const tagFilter = document.getElementById('tagFilter');
const cardTpl = document.getElementById('card-tpl');
let items = [];
let tags = new Set();

// Physics engine setup
const { Engine, Render, Runner, Bodies, Composite, Mouse, MouseConstraint, Events, Body } = Matter;
let engine, matterRender, runner, mouseConstraint;
let physicsCards = [];
let clickTimeout = null;
let isDragging = false;

async function loadCatalog() {
  const res = await fetch('catalog/catalog.json', { cache: 'no-store' });
  items = await res.json();
  tags = new Set();
  items.forEach(i => (i.tags || []).forEach(t => tags.add(t)));
  renderTagOptions();
  render();
}

function renderTagOptions() {
  const current = tagFilter.value || '';
  tagFilter.innerHTML = '<option value="">All tags</option>' +
    [...tags].sort().map(t => `<option value="${t}">${t}</option>`).join('');
  tagFilter.value = current;
}

function passesFilters(item) {
  const q = search.value.trim().toLowerCase();
  const tag = tagFilter.value;
  const hay = (item.title + ' ' + (item.description || '') + ' ' + (item.tags || []).join(' ')).toLowerCase();
  const searchOk = !q || hay.includes(q);
  const tagOk = !tag || (item.tags || []).includes(tag);
  return searchOk && tagOk;
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function initPhysics() {
  // Clean up existing engine if any
  if (engine) {
    Render.stop(matterRender);
    Runner.stop(runner);
    Engine.clear(engine);
    matterRender.canvas.remove();
    matterRender.canvas = null;
    matterRender.context = null;
    matterRender.textures = {};
  }

  // Create engine
  engine = Engine.create({
    gravity: { x: 0, y: 1 }
  });

  // Create renderer
  const gridRect = grid.getBoundingClientRect();
  const canvasHeight = window.innerHeight - gridRect.top;

  matterRender = Render.create({
    element: grid,
    engine: engine,
    options: {
      width: window.innerWidth,
      height: canvasHeight,
      wireframes: false,
      background: 'transparent'
    }
  });

  // Create ground and walls
  const canvasHeight = window.innerHeight - grid.getBoundingClientRect().top;

  const ground = Bodies.rectangle(
    window.innerWidth / 2,
    canvasHeight - 25,
    window.innerWidth,
    50,
    { isStatic: true, render: { fillStyle: 'transparent' } }
  );

  const leftWall = Bodies.rectangle(
    -25,
    canvasHeight / 2,
    50,
    canvasHeight,
    { isStatic: true, render: { fillStyle: 'transparent' } }
  );

  const rightWall = Bodies.rectangle(
    window.innerWidth + 25,
    canvasHeight / 2,
    50,
    canvasHeight,
    { isStatic: true, render: { fillStyle: 'transparent' } }
  );

  Composite.add(engine.world, [ground, leftWall, rightWall]);

  // Create mouse control
  const mouse = Mouse.create(matterRender.canvas);
  mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse,
    constraint: {
      stiffness: 0.2,
      render: { visible: false }
    }
  });

  Composite.add(engine.world, mouseConstraint);

  // Track dragging
  Events.on(mouseConstraint, 'startdrag', () => {
    isDragging = true;
  });

  Events.on(mouseConstraint, 'enddrag', () => {
    setTimeout(() => {
      isDragging = false;
    }, 100);
  });

  // Handle clicks for navigation
  Events.on(mouseConstraint, 'mousedown', (event) => {
    const mousePosition = event.mouse.position;

    clickTimeout = setTimeout(() => {
      if (!isDragging) {
        // Find clicked card
        const bodies = Composite.allBodies(engine.world);
        for (let body of bodies) {
          if (body.isStatic) continue;

          if (Matter.Bounds.contains(body.bounds, mousePosition)) {
            const card = physicsCards.find(c => c.body === body);
            if (card && card.href) {
              window.location.href = card.href;
            }
            break;
          }
        }
      }
    }, 200);
  });

  Events.on(mouseConstraint, 'mouseup', () => {
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }
  });

  // Start the engine
  Render.run(matterRender);
  runner = Runner.create();
  Runner.run(runner, engine);
}

function createPhysicsCard(item, index, total) {
  const cardWidth = 220;
  const cardHeight = 240;

  // Calculate initial position - spread across screen width, drop from header
  const cols = Math.floor(window.innerWidth / (cardWidth + 40));
  const row = Math.floor(index / cols);
  const col = index % cols;

  // Calculate horizontal position with some randomness
  const baseX = col * (cardWidth + 40) + cardWidth / 2 + 100;
  const x = baseX + (Math.random() - 0.5) * 50;

  // Start from header area (negative Y to drop from above)
  const y = -300 - (row * 80) - Math.random() * 100;

  // Random rotation for tumbling effect
  const rotation = (Math.random() - 0.5) * Math.PI / 3;

  // Create physics body
  const body = Bodies.rectangle(x, y, cardWidth, cardHeight, {
    restitution: 0.3,
    friction: 0.5,
    density: 0.001,
    angle: rotation,
    render: {
      fillStyle: 'transparent'
    }
  });

  // Create DOM element
  const cardElement = cardTpl.content.firstElementChild.cloneNode(true);
  cardElement.href = `viewer.html?id=${encodeURIComponent(item.id)}`;
  const img = cardElement.querySelector('img');
  img.src = item.thumb;
  img.alt = item.title;
  cardElement.querySelector('.title').textContent = item.title;
  cardElement.querySelector('.tags').textContent = (item.tags || []).join(' · ');

  // Style for physics mode
  cardElement.style.position = 'absolute';
  cardElement.style.width = cardWidth + 'px';
  cardElement.style.pointerEvents = 'none'; // Let Matter.js handle mouse events
  cardElement.style.transformOrigin = 'center center';

  grid.appendChild(cardElement);

  Composite.add(engine.world, body);

  return {
    body: body,
    element: cardElement,
    href: `viewer.html?id=${encodeURIComponent(item.id)}`
  };
}

function updatePhysicsCards() {
  physicsCards.forEach(card => {
    const { x, y } = card.body.position;
    const angle = card.body.angle;

    card.element.style.transform = `translate(${x - 110}px, ${y - 120}px) rotate(${angle}rad)`;
  });

  requestAnimationFrame(updatePhysicsCards);
}

function render(shouldShuffle = false) {
  // Clear existing
  grid.innerHTML = '';

  // Remove old physics bodies
  if (engine) {
    physicsCards.forEach(card => {
      Composite.remove(engine.world, card.body);
    });
  }
  physicsCards = [];

  let filtered = items.filter(passesFilters);
  if (shouldShuffle) {
    filtered = shuffleArray(filtered);
  }

  empty.hidden = filtered.length > 0;

  if (filtered.length > 0) {
    // Initialize physics if not already done
    if (!engine) {
      initPhysics();
    }

    // Create physics cards
    filtered.forEach((item, index) => {
      const card = createPhysicsCard(item, index, filtered.length);
      physicsCards.push(card);
    });

    // Start animation loop
    updatePhysicsCards();
  }
}

function shuffleGrid() {
  render(true);
}

search.addEventListener('input', () => render(false));
tagFilter.addEventListener('change', () => render(false));
document.getElementById('shuffleBtn').addEventListener('click', shuffleGrid);

// Handle window resize
window.addEventListener('resize', () => {
  if (matterRender && matterRender.canvas) {
    const canvasHeight = window.innerHeight - grid.getBoundingClientRect().top;
    matterRender.canvas.width = window.innerWidth;
    matterRender.canvas.height = canvasHeight;

    // Update boundaries
    const bodies = Composite.allBodies(engine.world);
    bodies.forEach(body => {
      if (body.isStatic) {
        Composite.remove(engine.world, body);
      }
    });

    const ground = Bodies.rectangle(
      window.innerWidth / 2,
      canvasHeight - 25,
      window.innerWidth,
      50,
      { isStatic: true, render: { fillStyle: 'transparent' } }
    );

    const leftWall = Bodies.rectangle(
      -25,
      canvasHeight / 2,
      50,
      canvasHeight,
      { isStatic: true, render: { fillStyle: 'transparent' } }
    );

    const rightWall = Bodies.rectangle(
      window.innerWidth + 25,
      canvasHeight / 2,
      50,
      canvasHeight,
      { isStatic: true, render: { fillStyle: 'transparent' } }
    );

    Composite.add(engine.world, [ground, leftWall, rightWall]);
  }
});

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

loadCatalog().then(() => render(true));
showDisclaimer();
