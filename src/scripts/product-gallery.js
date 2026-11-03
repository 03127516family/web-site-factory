import Swiper from 'swiper';
import { EffectFade } from 'swiper/modules';

export function mountGallery(root, { mode = 'site', initialIndex = 0, onActiveChange } = {}) {
  const main = root.querySelector(':scope > .gallery-top');
  const slidesContainer = main?.querySelector(':scope > .swiper-wrapper');
  const thumbnails = root.querySelector(':scope > .gallery-thumbs > .swiper-wrapper');
  if (!main || !slidesContainer || !thumbnails) {
    throw new Error('ProductGallery requires main and thumbnail containers.');
  }
  if (main.swiper) throw new Error('ProductGallery is already mounted.');

  const slides = Array.from(slidesContainer.children);
  const restoreStyles = preserveSwiperAttributes([main, slidesContainer, ...slides]);
  const buttons = [];
  let swiper;
  let destroyed = false;

  function syncSelection() {
    buttons.forEach((button, index) => {
      button.setAttribute('aria-current', String(index === swiper.activeIndex));
    });
  }

  function select(index) {
    if (destroyed || !swiper) return;
    swiper.slideTo(boundIndex(index, slides.length));
  }

  function onThumbnailClick(event) {
    const button = event.target.closest('button[data-gallery-control]');
    const index = buttons.indexOf(button);
    if (index !== -1) {
      const unchanged = index === swiper?.activeIndex;
      select(index);
      if (unchanged) onActiveChange?.(index);
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    thumbnails.removeEventListener('click', onThumbnailClick);
    try {
      swiper?.destroy(true, true);
    } finally {
      buttons.forEach(button => button.remove());
      restoreStyles();
    }
  }

  try {
    slides.forEach((slide, index) => {
      const image = slide.querySelector('img');
      if (!image) throw new Error(`ProductGallery slide ${index + 1} has no image.`);
      const button = createThumbnail(image, index);
      buttons.push(button);
      thumbnails.append(button);
    });
    thumbnails.addEventListener('click', onThumbnailClick);
    if (slides.length) {
      swiper = new Swiper(main, {
        modules: [EffectFade],
        init: false,
        effect: 'fade',
        fadeEffect: { crossFade: true },
        initialSlide: boundIndex(initialIndex, slides.length),
        allowTouchMove: mode !== 'edit',
        speed: mode === 'edit' ? 0 : 300,
        loop: false,
      });
      swiper.init();
      syncSelection();
      swiper.on('slideChange', () => {
        syncSelection();
        onActiveChange?.(swiper.activeIndex);
      });
    }
  } catch (error) {
    try {
      destroy();
    } catch {
      // Preserve the initialization error when Swiper cleanup also fails.
    }
    throw error;
  }

  return {
    select,
    get activeIndex() {
      return swiper && !destroyed ? swiper.activeIndex : -1;
    },
    destroy,
  };
}

function createThumbnail(image, index) {
  const button = image.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'swiper-slide';
  button.dataset.galleryControl = 'thumbnail';
  button.setAttribute('aria-label', image.alt ? `View image ${index + 1}: ${image.alt}` : `View image ${index + 1}`);

  const thumbnail = image.ownerDocument.createElement('img');
  thumbnail.src = image.currentSrc || image.src;
  thumbnail.alt = '';
  thumbnail.draggable = false;
  button.append(thumbnail);
  return button;
}

function boundIndex(index, length) {
  return Math.max(0, Math.min(length - 1, Number.isFinite(index) ? Math.trunc(index) : 0));
}

function preserveSwiperAttributes(elements) {
  const attributes = ['class', 'style', 'data-swiper-slide-index'];
  const snapshots = elements.map(element => ({
    element,
    values: attributes.map(name => element.getAttribute(name)),
  }));
  return () => {
    snapshots.forEach(({ element, values }) => {
      attributes.forEach((name, index) => {
        if (values[index] === null) {
          if (element.hasAttribute(name)) element.removeAttribute(name);
        }
        else element.setAttribute(name, values[index]);
      });
    });
  };
}
