const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const search = document.getElementById('search');
const tagFilter = document.getElementById('tagFilter');
const cardTpl = document.getElementById('card-tpl');
let items = [];
let tags = new Set();

// Custom Physics Engine
let physicsCards = [];
let isDragging = false;
let draggedCard = null;
let mouseX = 0;
let mouseY = 0;
let mouseDownTime = 0;
let animationId = null;

// Physics constants
const GRAVITY = 0.5;
const FRICTION = 0.98;
const BOUNCE = 0.6;
const DRAG_DAMPING = 0.95;

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

// Get boundaries for collision detection
function getBoundaries() {
  const footer = document.querySelector('.site-footer');
  const footerRect = footer ? footer.getBoundingClientRect() : null;

  // Ground should be at the top of the footer
  const groundY = footerRect ? footerRect.top : window.innerHeight;

  return {
    left: 0,
    right: window.innerWidth,
    top: 0,
    bottom: groundY
  };
}

// Check if point is inside card
function isPointInCard(x, y, card) {
  const hw = card.width / 2;
  const hh = card.height / 2;

  // Transform mouse coordinates relative to card center and rotation
  const dx = x - card.x;
  const dy = y - card.y;

  // Rotate point to card's local space
  const cos = Math.cos(-card.rotation);
  const sin = Math.sin(-card.rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  return Math.abs(localX) <= hw && Math.abs(localY) <= hh;
}

// Initialize mouse event handlers
function initPhysics() {
  let startMouseX = 0;
  let startMouseY = 0;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let lastClickTime = 0;
  let lastClickedCard = null;

  // Mouse move tracking
  const handleMouseMove = (e) => {
    const currentX = e.clientX;
    const currentY = e.clientY;

    if (draggedCard) {
      // Calculate total distance from start position
      const totalDistanceX = Math.abs(currentX - startMouseX);
      const totalDistanceY = Math.abs(currentY - startMouseY);

      // If moved more than 10 pixels total, it's a drag
      if (!isDragging && (totalDistanceX > 10 || totalDistanceY > 10)) {
        isDragging = true;
        console.log('Drag detected! Distance:', totalDistanceX, totalDistanceY);
      }

      // Update position if dragging
      if (isDragging) {
        draggedCard.x = currentX;
        draggedCard.y = currentY;
        draggedCard.velocityX = currentX - lastMouseX;
        draggedCard.velocityY = currentY - lastMouseY;
      }
    }

    lastMouseX = currentX;
    lastMouseY = currentY;
  };

  // Mouse down - start drag
  const handleMouseDown = (e) => {
    startMouseX = e.clientX;
    startMouseY = e.clientY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    isDragging = false;

    // Find card under mouse (check from top to bottom)
    for (let i = physicsCards.length - 1; i >= 0; i--) {
      const card = physicsCards[i];
      if (isPointInCard(e.clientX, e.clientY, card)) {
        e.preventDefault(); // Prevent default link behavior
        draggedCard = card;
        card.isDragged = true;

        // Bring to front
        physicsCards.splice(i, 1);
        physicsCards.push(card);

        break;
      }
    }
  };

  // Mouse up - release or check for double click
  const handleMouseUp = (e) => {
    if (draggedCard) {
      // Store whether we were dragging BEFORE resetting anything
      const wasDragging = isDragging;
      const clickedCard = draggedCard;

      console.log('Mouse up - wasDragging:', wasDragging);

      // Reset dragging state immediately
      draggedCard.isDragged = false;
      draggedCard = null;
      isDragging = false;

      if (wasDragging) {
        // Apply throw velocity only if card was actually dragged
        console.log('Applying throw velocity');
        const throwPower = 0.5;
        clickedCard.velocityX *= throwPower;
        clickedCard.velocityY *= throwPower;
      } else {
        // Check for double click (within 300ms of last click on same card)
        const currentTime = Date.now();
        const timeSinceLastClick = currentTime - lastClickTime;

        console.log('Click detected. Time since last click:', timeSinceLastClick, 'Same card?', lastClickedCard === clickedCard);

        if (timeSinceLastClick < 300 && lastClickedCard === clickedCard) {
          // Double click detected - navigate
          console.log('Double click! Navigating...');
          window.location.href = clickedCard.href;
        } else {
          // First click - just remember it
          console.log('First click recorded');
          lastClickTime = currentTime;
          lastClickedCard = clickedCard;
        }
      }
    } else {
      // No card was grabbed, just reset
      isDragging = false;
    }
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mouseup', handleMouseUp);
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
  cardElement.style.pointerEvents = 'auto';
  cardElement.style.transformOrigin = 'center center';
  cardElement.style.cursor = 'grab';

  grid.appendChild(cardElement);

  // Create physics object
  return {
    element: cardElement,
    href: `viewer.html?id=${encodeURIComponent(item.id)}`,
    x: x,
    y: y,
    width: cardWidth,
    height: cardHeight,
    velocityX: 0,
    velocityY: 0,
    rotation: rotation,
    angularVelocity: (Math.random() - 0.5) * 0.1,
    isDragged: false
  };
}

// Main physics update loop
function updatePhysicsCards() {
  const boundaries = getBoundaries();

  physicsCards.forEach(card => {
    // Skip if being dragged
    if (card.isDragged) {
      card.element.style.transform = `translate(${card.x - card.width / 2}px, ${card.y - card.height / 2}px) rotate(${card.rotation}rad)`;
      card.element.style.cursor = 'grabbing';
      return;
    } else {
      card.element.style.cursor = 'grab';
    }

    const hw = card.width / 2;
    const hh = card.height / 2;
    const onGround = card.y + hh >= boundaries.bottom - 5;

    // Check if card is at rest
    if (onGround && Math.abs(card.velocityX) < 0.5 && Math.abs(card.velocityY) < 0.5) {
      card.velocityX = 0;
      card.velocityY = 0;
      card.angularVelocity *= 0.9;

      if (Math.abs(card.angularVelocity) < 0.001) {
        card.angularVelocity = 0;
      }
    }

    // Only apply physics if not at complete rest
    if (card.velocityX !== 0 || card.velocityY !== 0 || card.angularVelocity !== 0) {
      // Apply gravity only if not on ground
      if (!onGround) {
        card.velocityY += GRAVITY;
      }

      // Apply velocity
      card.x += card.velocityX;
      card.y += card.velocityY;

      // Apply rotation
      card.rotation += card.angularVelocity;

      // Apply friction
      card.velocityX *= FRICTION;
      card.velocityY *= FRICTION;
      card.angularVelocity *= 0.95;

      // Ground collision
      if (card.y + hh > boundaries.bottom) {
        card.y = boundaries.bottom - hh;

        // Only bounce if coming down with significant velocity
        if (card.velocityY > 2) {
          card.velocityY *= -BOUNCE;
        } else {
          card.velocityY = 0;
        }

        card.velocityX *= 0.8; // Ground friction
        card.angularVelocity *= 0.8;
      }

      // Left wall collision
      if (card.x - hw < boundaries.left) {
        card.x = boundaries.left + hw;
        card.velocityX *= -BOUNCE;
      }

      // Right wall collision
      if (card.x + hw > boundaries.right) {
        card.x = boundaries.right - hw;
        card.velocityX *= -BOUNCE;
      }

      // Top boundary
      if (card.y - hh < boundaries.top) {
        card.y = boundaries.top + hh;
        card.velocityY = Math.abs(card.velocityY) * 0.5;
      }
    }

    // Update DOM transform
    card.element.style.transform = `translate(${card.x - card.width / 2}px, ${card.y - card.height / 2}px) rotate(${card.rotation}rad)`;
  });

  // Continue animation loop
  animationId = requestAnimationFrame(updatePhysicsCards);
}

function render(shouldShuffle = false) {
  // Clear existing
  grid.innerHTML = '';

  // Stop animation loop if running
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  physicsCards = [];

  let filtered = items.filter(passesFilters);
  if (shouldShuffle) {
    filtered = shuffleArray(filtered);
  }

  empty.hidden = filtered.length > 0;

  if (filtered.length > 0) {
    // Create physics cards
    filtered.forEach((item, index) => {
      const card = createPhysicsCard(item, index, filtered.length);
      physicsCards.push(card);
    });

    // Start animation loop
    updatePhysicsCards();
  }
}

// Initialize physics once on load
let physicsInitialized = false;
if (!physicsInitialized) {
  initPhysics();
  physicsInitialized = true;
}

function shuffleGrid() {
  render(true);
}

search.addEventListener('input', () => render(false));
tagFilter.addEventListener('change', () => render(false));
document.getElementById('shuffleBtn').addEventListener('click', shuffleGrid);

// Handle window resize - boundaries update automatically via getBoundaries()
window.addEventListener('resize', () => {
  // Boundaries will be recalculated in the next animation frame
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
