// 本地化自 dgcrane.com 产品页正文内联脚本：流程编号 / 型号分栏 / 画廊 swiper 联动 / 平滑滚动

	var par = document.querySelector(".process");
	var lis = par.getElementsByClassName("grid3");
	var num;
	for(var i= 0; i < lis.length; i++){
		num = i+1;
	    lis[i].querySelector("h4 i").innerText = num;
	}


	var grid_num = document.querySelectorAll('.grid_3').length;
	var n = 1;
	for(var i = 0; i < grid_num; i++){
		if(i == 2*n){
			var node = document.createElement('div');
			node.setAttribute('class','clearfix');
			document.querySelector('.types_info').insertBefore(node,document.querySelectorAll('.grid_3')[i]);
			n++;
		}
	}


 
    var galleryThumbs = new Swiper('.gallery-thumbs', {
      spaceBetween: 1,
      slidesPerView: 3,
      freeMode: true,
      watchSlidesVisibility: true,
      watchSlidesProgress: true,
    });
    var galleryTop = new Swiper('.gallery-top', {
      spaceBetween: 1,
	  effect: 'fade',

    //   navigation: {
    //    nextEl: '.swiper-button-next',
    //    prevEl: '.swiper-button-prev',
    //   },
      thumbs: {
        swiper: galleryThumbs
      }
    });
  
  
      document.addEventListener('DOMContentLoaded', function () {
          const headerHeight = 100; // Height of the fixed header
          document.querySelectorAll('a[href^="#"]').forEach(anchor => {
              anchor.addEventListener('click', function (e) {
                  e.preventDefault();

                  const targetId = this.getAttribute('href').substring(1);
                  const targetElement = document.getElementById(targetId);

                  if (targetElement) {
                      const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - headerHeight;

                      window.scrollTo({
                          top: targetPosition,
                          behavior: 'smooth'
                      });
                  }
              });
          });
      });
  
