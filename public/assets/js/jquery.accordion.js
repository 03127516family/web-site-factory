var first_child = jQuery(".faq_block").first();
first_child.find(".faq_a").css({"display":"block"});
first_child.addClass("on");
	jQuery(".faq_q").click(function(){
	jQuery(this).parent(".faq_block").find('.faq_a').slideToggle(200);
	jQuery(this).parent('.faq_block').toggleClass("on");
});