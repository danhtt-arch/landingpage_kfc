/**
 * KFC Landing Page - Vanilla JavaScript Engine
 * Specifications: FUNCTIONAL.md, DATA.md, IMPLEMENTATION.md
 */

document.addEventListener('DOMContentLoaded', () => {
  // Global State
  let allProducts = [];
  let currentCategory = 'Tất cả';

  // Fallback high-res food photography URLs (in case local images fail)
  const FALLBACK_IMAGES = {
    'Gà rán': 'https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?auto=format&fit=crop&w=600&q=80',
    'Combo': 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=600&q=80',
    'Burger': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
    'Món ăn kèm': 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80',
    'Đồ uống': 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80',
    'default': 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=600&q=80'
  };

  // DOM Elements
  const featuredGrid = document.getElementById('featured-grid');
  const menuGrid = document.getElementById('menu-grid');
  const menuStatus = document.getElementById('menu-status');
  const categoryFiltersContainer = document.getElementById('category-filters');
  const mobileToggle = document.getElementById('mobile-toggle');
  const navMenu = document.getElementById('nav-menu');
  const navLinks = document.querySelectorAll('.nav-link');

  // Initialize App
  initApp();

  /**
   * Main App Initialization
   */
  async function initApp() {
    initMobileNavigation();
    initSmoothScrolling();
    await loadProductsFromCSV();
  }

  // Embedded Fallback CSV Data (Dành cho trường hợp mở file:// trực tiếp không qua Local Server)
  const EMBEDDED_CSV_FALLBACK = `id,name,category,description,price,image,featured,discount
1,"Gà Rán Giòn Cay","Gà rán","Gà rán giòn rụm đậm vị cay nồng chuẩn vị KFC, lớp vỏ vàng ươm hấp dẫn.","45000","assets/images/chicken-1.jpg","true","10"
2,"Gà Truyền Thống","Gà rán","Công thức 11 loại thảo mộc và gia vị bí truyền đậm đà, thịt gà mềm mọng nước.","45000","assets/images/chicken-2.jpg","false","0"
3,"Combo Gà Rán 1 Người","Combo","1 Miếng Gà Rán + 1 Khoai Tây Chiên (Vừa) + 1 Pepsi Tươi mát lạnh.","95000","assets/images/combo-1.jpg","true","10"
4,"Combo Gia Đình Thỏa Thích","Combo","6 Miếng Gà Rán + 2 Khoai Tây Chiên (Lớn) + 3 Pepsi Tươi giải nhiệt.","279000","assets/images/combo-2.jpg","true","10"
5,"Burger Gà Zinger","Burger","Fillet gà giòn cay kẹp trong bánh mì mè thơm, xà lách tươi và sốt Mayo đậm đà.","65000","assets/images/burger-1.jpg","true","0"
6,"Burger Gà Phô Mai","Burger","Fillet gà giòn phủ sốt phô mai cheddar tan chảy béo ngậy cực đỉnh.","59000","assets/images/burger-2.jpg","false","10"
7,"Khoai Tây Chiên (L)","Món ăn kèm","Khoai tây chiên vàng giòn rụm, vỏ mỏng ruột mịn bùi béo.","35000","assets/images/side-1.jpg","false","0"
8,"Bắp Cải Trộn Coleslaw","Món ăn kèm","Bắp cải tươi giòn ngọt trộn sốt béo thanh nhẹ giải ngấy hoàn hảo.","22000","assets/images/side-2.jpg","false","0"
9,"Pepsi Tươi Cold","Đồ uống","Ly Pepsi tươi mát lạnh sảng khoái đánh tan cơn khát.","19000","assets/images/drink-1.jpg","false","0"
10,"Trà Đào Băng Tuyết","Đồ uống","Trà đào thơm ngát thanh nhiệt kết hợp đá tuyết mát lạnh sảng khoái.","29000","assets/images/drink-2.jpg","false","0"`;

  /**
   * Load and Parse CSV Data from data/menu.csv
   */
  async function loadProductsFromCSV() {
    try {
      showStatus('Đang tải menu KFC...', 'loading');
      let csvText = '';

      // Nếu mở trực tiếp file:// từ ổ cứng, trình duyệt sẽ chặn fetch() do chính sách bảo mật CORS.
      if (window.location.protocol === 'file:') {
        console.info('[KFC Landing Page]: Đang chạy giao thức file://. Sử dụng dữ liệu CSV nội suy để hiển thị trực tiếp.');
        csvText = EMBEDDED_CSV_FALLBACK;
      } else {
        try {
          const response = await fetch('data/menu.csv');
          if (!response.ok) {
            throw new Error(`HTTP Error status: ${response.status}`);
          }
          csvText = await response.text();
        } catch (fetchErr) {
          console.warn('[KFC Landing Page]: Fetch CSV thất bại, chuyển sang sử dụng dữ liệu dự phòng.', fetchErr);
          csvText = EMBEDDED_CSV_FALLBACK;
        }
      }

      allProducts = parseCSV(csvText);

      if (!allProducts || allProducts.length === 0) {
        throw new Error('Dữ liệu menu rỗng');
      }

      hideStatus();
      renderFeaturedProducts(allProducts);
      renderCategoryFilters(allProducts);
      renderMenuGrid(allProducts, 'Tất cả');

      // Báo cho các module khác (Giỏ hàng) biết menu đã sẵn sàng
      window.dispatchEvent(new CustomEvent('menu:loaded', { detail: { products: allProducts } }));

    } catch (error) {
      console.error('[KFC Landing Page Error]: Failed to load CSV data:', error);
      showStatus('Không thể tải menu. Vui lòng thử lại sau.', 'error');
    }
  }

  /**
   * Parse CSV: dùng js/csv.js (KFCCsv) để có thể test độc lập
   */
  function parseCSV(text) {
    return window.KFCCsv ? window.KFCCsv.parseCSV(text) : [];
  }

  /**
   * Render Featured Products (featured === true)
   */
  function renderFeaturedProducts(products) {
    if (!featuredGrid) return;
    featuredGrid.innerHTML = '';

    const featuredItems = products.filter(p => p.featured === true);

    if (featuredItems.length === 0) {
      featuredGrid.parentElement.style.display = 'none';
      return;
    }

    featuredItems.forEach(product => {
      const card = createProductCard(product, true);
      featuredGrid.appendChild(card);
    });
  }

  /**
   * Dynamic Category Filter Buttons Rendering
   */
  function renderCategoryFilters(products) {
    if (!categoryFiltersContainer) return;

    // Get unique categories from CSV
    const categories = ['Tất cả', ...new Set(products.map(p => p.category))];

    categoryFiltersContainer.innerHTML = '';

    categories.forEach(category => {
      const button = document.createElement('button');
      button.className = `filter-btn ${category === currentCategory ? 'active' : ''}`;
      button.textContent = category;
      button.setAttribute('data-category', category);
      button.setAttribute('aria-label', `Lọc theo danh mục ${category}`);

      button.addEventListener('click', () => {
        if (currentCategory === category) return;
        currentCategory = category;

        // Update active filter button
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        // Render filtered grid
        renderMenuGrid(allProducts, currentCategory);
      });

      categoryFiltersContainer.appendChild(button);
    });
  }

  /**
   * Render Menu Grid based on Category Filter
   */
  function renderMenuGrid(products, category) {
    if (!menuGrid) return;
    menuGrid.innerHTML = '';

    const filtered = category === 'Tất cả' 
      ? products 
      : products.filter(p => p.category === category);

    if (filtered.length === 0) {
      menuGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--color-text-muted);">
          <p>Không có sản phẩm nào trong danh mục này.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(product => {
      const card = createProductCard(product, false);
      menuGrid.appendChild(card);
    });
  }

  /**
   * Create Product Card DOM Element safely
   */
  function createProductCard(product, isFeatured = false) {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.setAttribute('data-id', product.id);

    // Image Wrapper
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'product-card__img-wrapper';

    const img = document.createElement('img');
    img.src = product.image;
    img.alt = product.name || 'Sản phẩm KFC';
    img.loading = 'lazy';

    // Fallback Image handling if local file isn't available
    img.onerror = () => {
      img.onerror = null; // Prevent infinite loop
      img.src = FALLBACK_IMAGES[product.category] || FALLBACK_IMAGES['default'];
    };

    imgWrapper.appendChild(img);

    // Nhãn giảm giá (cột discount trong CSV)
    const discount = window.KFCPricing ? window.KFCPricing.normalizeDiscount(product.discount) : 0;
    if (discount > 0) {
      const sale = document.createElement('span');
      sale.className = 'product-card__sale';
      sale.textContent = `-${discount}%`;
      imgWrapper.appendChild(sale);
    }

    if (isFeatured) {
      const badge = document.createElement('span');
      badge.className = 'product-card__badge';
      badge.textContent = 'Hot';
      imgWrapper.appendChild(badge);
    }

    // Card Content
    const content = document.createElement('div');
    content.className = 'product-card__content';

    const categorySpan = document.createElement('span');
    categorySpan.className = 'product-card__category';
    categorySpan.textContent = product.category;

    const title = document.createElement('h3');
    title.className = 'product-card__title';
    title.textContent = product.name;

    const desc = document.createElement('p');
    desc.className = 'product-card__description';
    desc.textContent = product.description;

    // Card Footer
    const footer = document.createElement('div');
    footer.className = 'product-card__footer';

    // Giá: nếu có giảm thì hiện giá sau giảm + giá gốc gạch ngang
    const pricing = document.createElement('div');
    pricing.className = 'product-card__pricing';

    const price = document.createElement('span');
    price.className = 'product-card__price';
    pricing.appendChild(price);

    if (discount > 0) {
      price.textContent = formatPrice(window.KFCPricing.discountedPrice(product.price, discount));

      const oldPrice = document.createElement('del');
      oldPrice.className = 'product-card__old-price';
      oldPrice.textContent = formatPrice(product.price);
      pricing.appendChild(oldPrice);

      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = `Giảm ${discount}%, giá gốc ${formatPrice(product.price)}`;
      pricing.appendChild(sr);
    } else {
      price.textContent = formatPrice(product.price);
    }

    // Nút thêm vào giỏ: phát sự kiện, module Giỏ hàng (js/cart) sẽ xử lý
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'product-card__btn';
    btn.textContent = 'Thêm vào giỏ';
    btn.setAttribute('aria-label', `Thêm ${product.name} vào giỏ hàng`);
    btn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('cart:add', { detail: { product } }));
    });

    footer.appendChild(pricing);
    footer.appendChild(btn);

    content.appendChild(categorySpan);
    content.appendChild(title);
    content.appendChild(desc);
    content.appendChild(footer);

    card.appendChild(imgWrapper);
    card.appendChild(content);

    return card;
  }

  /**
   * Format numeric price into VND currency format (e.g. 45000 -> 45.000 ₫)
   */
  function formatPrice(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  }

  /**
   * Mobile Navigation Toggle
   */
  function initMobileNavigation() {
    if (!mobileToggle || !navMenu) return;

    mobileToggle.addEventListener('click', () => {
      const isOpen = navMenu.classList.toggle('open');
      mobileToggle.classList.toggle('active');
      mobileToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Close menu when clicking navigation link
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (navMenu.classList.contains('open')) {
          navMenu.classList.remove('open');
          mobileToggle.classList.remove('active');
          mobileToggle.setAttribute('aria-expanded', 'false');
        }
      });
    });
  }

  /**
   * Smooth Scroll & Active Nav Indicator on Scroll
   */
  function initSmoothScrolling() {
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        const targetId = link.getAttribute('href');
        if (targetId && targetId.startsWith('#')) {
          e.preventDefault();
          const targetSection = document.querySelector(targetId);
          if (targetSection) {
            const headerOffset = 72;
            const elementPosition = targetSection.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
              top: offsetPosition,
              behavior: 'smooth'
            });

            // Update active state
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
          }
        }
      });
    });

    // Update active nav link on window scroll
    window.addEventListener('scroll', () => {
      const scrollPos = window.scrollY + 100;
      const sections = document.querySelectorAll('section[id]');

      sections.forEach(section => {
        const top = section.offsetTop - 80;
        const height = section.offsetHeight;
        const id = section.getAttribute('id');

        if (scrollPos >= top && scrollPos < top + height) {
          navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${id}`) {
              link.classList.add('active');
            }
          });
        }
      });
    });
  }

  /**
   * Helper Functions for Loading & Error Status
   */
  function showStatus(message, type = 'loading') {
    if (!menuStatus) return;
    menuStatus.style.display = 'block';

    if (type === 'loading') {
      menuStatus.innerHTML = `
        <div class="loading-spinner"></div>
        <p class="status-message">${message}</p>
      `;
    } else {
      menuStatus.innerHTML = `
        <p class="status-message error-message">⚠️ ${message}</p>
      `;
    }
  }

  function hideStatus() {
    if (!menuStatus) return;
    menuStatus.style.display = 'none';
  }
});
