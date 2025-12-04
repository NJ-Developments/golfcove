/**
 * Golf Cove - Main JavaScript
 * Production-ready interactive features and animations
 * @version 1.0.0
 */

(function() {
    'use strict';

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    const utils = {
        debounce: function(func, wait, immediate) {
            let timeout;
            return function() {
                const context = this, args = arguments;
                const later = function() {
                    timeout = null;
                    if (!immediate) func.apply(context, args);
                };
                const callNow = immediate && !timeout;
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
                if (callNow) func.apply(context, args);
            };
        },
        
        throttle: function(func, limit) {
            let inThrottle;
            return function() {
                const args = arguments;
                const context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },
        
        isValidEmail: function(email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        },
        
        isTouchDevice: function() {
            return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        }
    };

    // ============================================
    // MAIN APPLICATION
    // ============================================
    const GolfCove = {
        init: function() {
            this.cacheElements();
            this.bindEvents();
            this.initScrollAnimations();
            this.initTestimonialCarousel();
            this.highlightActiveNav();
            this.initLazyLoading();
        },

        cacheElements: function() {
            this.header = document.querySelector('header');
            this.mobileMenuToggle = document.getElementById('mobileMenuToggle');
            this.mainNav = document.getElementById('mainNav');
            this.backToTopBtn = document.getElementById('backToTop');
            this.dropdowns = document.querySelectorAll('.dropdown');
            this.newsletterForm = document.querySelector('.newsletter-form');
            this.contactForm = document.querySelector('.contact-form form');
            this.galleryItems = document.querySelectorAll('.gallery-item');
            this.testimonialItems = document.querySelectorAll('.testimonial-item');
            this.mobileActions = document.querySelector('.mobile-actions');
        },

        bindEvents: function() {
            // Mobile Menu
            if (this.mobileMenuToggle && this.mainNav) {
                this.mobileMenuToggle.addEventListener('click', this.toggleMobileMenu.bind(this));
                
                // Ensure a mobile actions wrapper with a call button exists
                if (!this.mobileActions) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'mobile-actions';
                    const headerMain = this.mobileMenuToggle.parentElement;
                    if (headerMain) {
                        headerMain.appendChild(wrapper);
                        this.mobileActions = wrapper;
                    }
                }
                if (this.mobileActions && !this.mobileActions.querySelector('.mobile-call')) {
                    const callLink = document.createElement('a');
                    callLink.href = 'tel:2033905994';
                    callLink.className = 'mobile-call';
                    callLink.setAttribute('aria-label', 'Call Golf Cove');
                    callLink.innerHTML = '<i class="fas fa-phone"></i>';
                    this.mobileActions.appendChild(callLink);
                    this.mobileActions.appendChild(this.mobileMenuToggle);
                }

                document.addEventListener('click', this.closeMobileMenuOnOutsideClick.bind(this));
            }

            // Back to Top
            if (this.backToTopBtn) {
                window.addEventListener('scroll', utils.throttle(this.handleBackToTop.bind(this), 100));
                this.backToTopBtn.addEventListener('click', this.scrollToTop.bind(this));
            }

            // Header scroll effect
            if (this.header) {
                window.addEventListener('scroll', utils.throttle(this.handleHeaderScroll.bind(this), 50));
            }

            // Smooth scroll for anchor links
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', this.handleSmoothScroll.bind(this));
            });

            // Dropdown accessibility
            this.dropdowns.forEach(dropdown => {
                this.initDropdownAccessibility(dropdown);
            });

            // Newsletter form
            if (this.newsletterForm) {
                this.newsletterForm.addEventListener('submit', this.handleNewsletterSubmit.bind(this));
            }

            // Contact form
            if (this.contactForm) {
                this.contactForm.addEventListener('submit', this.handleContactSubmit.bind(this));
            }

            // Gallery lightbox
            this.galleryItems.forEach(item => {
                item.addEventListener('click', this.openLightbox.bind(this, item));
                item.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.openLightbox(item);
                });
            });

            // Keyboard navigation
            document.addEventListener('keydown', this.handleKeyboardNav.bind(this));
        },

        // ============================================
        // MOBILE MENU
        // ============================================
        toggleMobileMenu: function(e) {
            e.stopPropagation();
            const isOpen = this.mainNav.classList.toggle('active');
            this.mobileMenuToggle.classList.toggle('active');
            this.mobileMenuToggle.setAttribute('aria-expanded', isOpen);
            
            // Prevent body scroll when menu is open
            document.body.style.overflow = isOpen ? 'hidden' : '';
        },

        closeMobileMenuOnOutsideClick: function(e) {
            if (this.mainNav && this.mainNav.classList.contains('active')) {
                if (!this.mainNav.contains(e.target) && !this.mobileMenuToggle.contains(e.target)) {
                    this.mainNav.classList.remove('active');
                    this.mobileMenuToggle.classList.remove('active');
                    this.mobileMenuToggle.setAttribute('aria-expanded', 'false');
                    document.body.style.overflow = '';
                }
            }
        },

        // ============================================
        // BACK TO TOP
        // ============================================
        handleBackToTop: function() {
            if (window.scrollY > 400) {
                this.backToTopBtn.classList.add('visible');
            } else {
                this.backToTopBtn.classList.remove('visible');
            }
        },

        scrollToTop: function(e) {
            e.preventDefault();
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
            // Set focus for accessibility
            document.body.focus();
        },

        // ============================================
        // HEADER SCROLL EFFECT
        // ============================================
        handleHeaderScroll: function() {
            if (window.scrollY > 80) {
                this.header.classList.add('scrolled');
            } else {
                this.header.classList.remove('scrolled');
            }
        },

        // ============================================
        // SMOOTH SCROLL
        // ============================================
        handleSmoothScroll: function(e) {
            const targetId = e.currentTarget.getAttribute('href');
            
            if (targetId !== '#' && targetId.length > 1) {
                e.preventDefault();
                const target = document.querySelector(targetId);
                
                if (target) {
                    const headerHeight = this.header ? this.header.offsetHeight : 0;
                    const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                    
                    // Set focus for accessibility
                    target.setAttribute('tabindex', '-1');
                    target.focus();
                }
            }
        },

        // ============================================
        // DROPDOWN ACCESSIBILITY
        // ============================================
        initDropdownAccessibility: function(dropdown) {
            const link = dropdown.querySelector(':scope > a');
            const menu = dropdown.querySelector('.dropdown-menu');
            
            if (link && menu) {
                link.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        const isExpanded = link.getAttribute('aria-expanded') === 'true';
                        link.setAttribute('aria-expanded', !isExpanded);
                        dropdown.classList.toggle('active');
                    }
                });
                
                // Click/touch support for mobile
                link.addEventListener('click', (e) => {
                    if (window.innerWidth <= 992) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Close all other dropdowns
                        this.dropdowns.forEach(d => {
                            if (d !== dropdown) {
                                d.classList.remove('active');
                                const dLink = d.querySelector(':scope > a');
                                if (dLink) dLink.setAttribute('aria-expanded', 'false');
                            }
                        });
                        
                        const isOpen = dropdown.classList.toggle('active');
                        link.setAttribute('aria-expanded', isOpen);
                    }
                });
            }
        },

        // ============================================
        // SCROLL ANIMATIONS
        // ============================================
        initScrollAnimations: function() {
            const fadeElements = document.querySelectorAll('.fade-in, .feature-card, .gallery-item, .membership-card, .sport-card');
            
            if ('IntersectionObserver' in window) {
                const fadeInObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add('visible');
                            entry.target.style.opacity = '1';
                            entry.target.style.transform = 'translateY(0)';
                        }
                    });
                }, {
                    threshold: 0.1,
                    rootMargin: '0px 0px -60px 0px'
                });
                
                fadeElements.forEach(el => {
                    el.style.opacity = '0';
                    el.style.transform = 'translateY(30px)';
                    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
                    fadeInObserver.observe(el);
                });
            } else {
                // Fallback for older browsers
                fadeElements.forEach(el => {
                    el.style.opacity = '1';
                    el.style.transform = 'none';
                });
            }
        },

        // ============================================
        // TESTIMONIAL CAROUSEL
        // ============================================
        initTestimonialCarousel: function() {
            if (this.testimonialItems.length > 1) {
                let currentIndex = 0;
                let autoPlayInterval;
                
                // Hide all but first
                this.testimonialItems.forEach((item, index) => {
                    item.style.display = index === 0 ? 'block' : 'none';
                    item.setAttribute('aria-hidden', index !== 0);
                });
                
                const showTestimonial = (index) => {
                    this.testimonialItems.forEach((item, i) => {
                        item.style.display = i === index ? 'block' : 'none';
                        item.setAttribute('aria-hidden', i !== index);
                        if (i === index) {
                            item.style.animation = 'fadeIn 0.6s ease';
                        }
                    });
                };
                
                const nextTestimonial = () => {
                    currentIndex = (currentIndex + 1) % this.testimonialItems.length;
                    showTestimonial(currentIndex);
                };
                
                // Auto-rotate every 7 seconds
                autoPlayInterval = setInterval(nextTestimonial, 7000);
                
                // Pause on hover
                const carousel = document.querySelector('.testimonial-carousel');
                if (carousel) {
                    carousel.addEventListener('mouseenter', () => clearInterval(autoPlayInterval));
                    carousel.addEventListener('mouseleave', () => {
                        autoPlayInterval = setInterval(nextTestimonial, 7000);
                    });
                }
            }
        },

        // ============================================
        // FORM HANDLING
        // ============================================
        handleNewsletterSubmit: function(e) {
            e.preventDefault();
            
            const emailInput = this.newsletterForm.querySelector('input[type="email"]');
            const email = emailInput.value.trim();
            const submitBtn = this.newsletterForm.querySelector('button');
            
            if (email && utils.isValidEmail(email)) {
                const originalText = submitBtn.textContent;
                
                submitBtn.textContent = '✓ Subscribed!';
                submitBtn.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
                submitBtn.disabled = true;
                emailInput.value = '';
                
                setTimeout(() => {
                    submitBtn.textContent = originalText;
                    submitBtn.style.background = '';
                    submitBtn.disabled = false;
                }, 3500);
            } else {
                emailInput.style.borderColor = '#ef4444';
                emailInput.focus();
                setTimeout(() => {
                    emailInput.style.borderColor = '';
                }, 2000);
            }
        },

        handleContactSubmit: function(e) {
            e.preventDefault();
            
            const inputs = this.contactForm.querySelectorAll('input[required], textarea[required]');
            let isValid = true;
            
            inputs.forEach(input => {
                if (!input.value.trim()) {
                    isValid = false;
                    input.style.borderColor = '#ef4444';
                    input.setAttribute('aria-invalid', 'true');
                } else {
                    input.style.borderColor = '';
                    input.setAttribute('aria-invalid', 'false');
                }
            });
            
            if (isValid) {
                const submitBtn = this.contactForm.querySelector('.btn-submit');
                const originalText = submitBtn.textContent;
                
                submitBtn.textContent = '✓ Message Sent!';
                submitBtn.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
                submitBtn.disabled = true;
                
                this.contactForm.reset();
                
                setTimeout(() => {
                    submitBtn.textContent = originalText;
                    submitBtn.style.background = '';
                    submitBtn.disabled = false;
                }, 3500);
            }
        },

        // ============================================
        // GALLERY LIGHTBOX
        // ============================================
        openLightbox: function(item) {
            const img = item.querySelector('img');
            if (!img || document.querySelector('.lightbox')) return;
            
            const lightbox = document.createElement('div');
            lightbox.className = 'lightbox';
            lightbox.setAttribute('role', 'dialog');
            lightbox.setAttribute('aria-modal', 'true');
            lightbox.setAttribute('aria-label', 'Image lightbox');
            lightbox.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.95);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                cursor: pointer;
                animation: fadeIn 0.3s ease;
            `;
            
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '&times;';
            closeBtn.setAttribute('aria-label', 'Close lightbox');
            closeBtn.style.cssText = `
                position: absolute;
                top: 20px;
                right: 30px;
                font-size: 3rem;
                color: white;
                background: none;
                border: none;
                cursor: pointer;
                z-index: 10001;
                transition: transform 0.2s ease;
            `;
            closeBtn.addEventListener('mouseenter', () => closeBtn.style.transform = 'rotate(90deg)');
            closeBtn.addEventListener('mouseleave', () => closeBtn.style.transform = '');
            
            const lightboxImg = document.createElement('img');
            lightboxImg.src = img.src;
            lightboxImg.alt = img.alt;
            lightboxImg.style.cssText = `
                max-width: 90%;
                max-height: 90%;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                animation: scaleIn 0.3s ease;
            `;
            
            lightbox.appendChild(closeBtn);
            lightbox.appendChild(lightboxImg);
            document.body.appendChild(lightbox);
            document.body.style.overflow = 'hidden';
            
            const closeLightbox = () => {
                lightbox.style.animation = 'fadeIn 0.2s ease reverse';
                setTimeout(() => {
                    lightbox.remove();
                    document.body.style.overflow = '';
                    item.focus();
                }, 200);
            };
            
            lightbox.addEventListener('click', (e) => {
                if (e.target === lightbox || e.target === closeBtn) {
                    closeLightbox();
                }
            });
            
            closeBtn.focus();
        },

        // ============================================
        // KEYBOARD NAVIGATION
        // ============================================
        handleKeyboardNav: function(e) {
            // Close lightbox on Escape
            if (e.key === 'Escape') {
                const lightbox = document.querySelector('.lightbox');
                if (lightbox) {
                    lightbox.click();
                }
                
                // Close mobile menu
                if (this.mainNav && this.mainNav.classList.contains('active')) {
                    this.mainNav.classList.remove('active');
                    this.mobileMenuToggle.classList.remove('active');
                    this.mobileMenuToggle.setAttribute('aria-expanded', 'false');
                    document.body.style.overflow = '';
                }
            }
        },

        // ============================================
        // ACTIVE NAV HIGHLIGHTING
        // ============================================
        highlightActiveNav: function() {
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';
            const navLinks = document.querySelectorAll('.nav-menu > li > a');
            
            navLinks.forEach(link => {
                const linkPage = link.getAttribute('href');
                if (linkPage === currentPage || (currentPage === '' && linkPage === 'index.html')) {
                    link.classList.add('active');
                    link.setAttribute('aria-current', 'page');
                }
            });
        },

        // ============================================
        // LAZY LOADING (Native support check)
        // ============================================
        initLazyLoading: function() {
            if ('loading' in HTMLImageElement.prototype) {
                // Native lazy loading supported
                document.querySelectorAll('img[loading="lazy"]').forEach(img => {
                    img.src = img.dataset.src || img.src;
                });
            } else {
                // Fallback using Intersection Observer
                const lazyImages = document.querySelectorAll('img[data-src]');
                
                if ('IntersectionObserver' in window) {
                    const imageObserver = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting) {
                                const img = entry.target;
                                img.src = img.dataset.src;
                                img.removeAttribute('data-src');
                                imageObserver.unobserve(img);
                            }
                        });
                    });
                    
                    lazyImages.forEach(img => imageObserver.observe(img));
                }
            }
        }
    };

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        GolfCove.init();
    });

    // Page fully loaded
    window.addEventListener('load', function() {
        document.body.classList.add('loaded');
    });

})();
