jQuery(document).ready(function(){
    jQuery('.copybtn').click(function(event){
        var text = jQuery(this).parent('.copying').find('.copytext').text();
        var input = jQuery("#input");
        input.val(text); 
        input.select(); 
        document.execCommand("copy");
        jQuery('.success').fadeIn();
        var owl=jQuery(this);
        setTimeout(function () {
           jQuery('.success').delay(300).fadeOut();
        }, 1000)
    });
});