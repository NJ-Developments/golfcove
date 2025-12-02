/* Copyright (C) YOOtheme GmbH, YOOtheme Proprietary Use License (http://www.yootheme.com/license) */

jQuery(function($) {

    // Options
    var config = $('html').data('config') || {},
        navbar = $('.tm-navbar');

    // Centered dropdown
    navbar.find('.uk-dropdown').addClass('uk-dropdown-center');

    // Trigger focus on search input
    $(".tm-search-button").on('click', UIkit.Utils.debounce(function () {
        this.parentNode.querySelector('.uk-search-field').focus();
    }, 300));

    // Social buttons
    $('article[data-permalink]').socialButtons(config);

    // Delete grid-divider border on first item in row
    $('.uk-grid.tm-grid-divider').each(function() {
        var $this = $(this),
            items = $this.children().filter(':visible'), pos;

        if (items.length > 0) {
            pos_cache = items.first().position().left;

            UIkit.$win.on('load resize', UIkit.Utils.debounce((function(fn) {

                fn = function () {

                    items.each(function() {

                        pos = $(this).position();

                        $(this)[pos.left == pos_cache ? 'addClass':'removeClass']('uk-row-first');
                    });

                    return fn;
                }

                return fn();

            })(), 80));
        }

    });

});
