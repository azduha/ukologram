if ( !window.requestAnimationFrame ) {
    window.requestAnimationFrame = ( function() {
        return window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function( /* function FrameRequestCallback */ callback, /* DOMElement Element */ element ) {
            window.setTimeout( callback, 1000 / 60 );
        };
    } )();
}

var input = {dragStartX:0, dragStartY:0, dragX:0, dragY:0, dragDX:0, dragDY:0, dragging:false, isGesture: false, isTouch: false, touchStartDistance:0};
var planeCanvas;
var prefixedTransform;

var currentScale = 1;
var posX = 0;
var posY = 0;
var velocityX = 0;
var velocityY = 0;

var minScale = 0.05;
var maxScale = 1;
var scaleVelocity = 1.006;
var scrollVelocity = 1.1;
var buttonVelocity = 1.5;

var planeSize = 10000;
var overviewTreshold = 0.2;

var velocityDecreaseTouch = 0.92;
var velocityDecrease = 0.88;
var velocityDecreaseOnHold = 0.3;

var touchMultiplier = 1.4;

var minMaxXY = planeSize;

var lastHash = "";

function planeInit(x = 0, y = 0, size = planeSize) {
    planeSize = size;
    minMaxXY = planeSize / 2;
    posX = x;
    posY = y;
    planeCanvas = document.getElementById('planeCanvas');
    planeCanvas.style.width = planeSize + "px";
    planeCanvas.style.height = planeSize + "px";

    if('transform' in document.body.style){
        prefixedTransform='transform';
    }else if('webkitTransform' in document.body.style){
        prefixedTransform='webkitTransform';
    }

    planeTouch = document.getElementById('planeSVG');
    planeContainer = document.getElementById('planeContainer');

    if (window.PointerEvent) {
        input.pointers=[];
        planeTouch.addEventListener("pointerdown", pointerDownHandler, false);
        planeContainer.addEventListener("mousewheel", mouseWheelHandler, false);
        planeContainer.addEventListener("DOMMouseScroll", mouseWheelHandler, false);
    } else {
        planeTouch.addEventListener('touchstart', onTouchStart);
        planeTouch.addEventListener('mousedown', onplaneMouseDown);
    }

    setButtonAction('planeControlButtonIn', zoomIn);
    setButtonAction('planeControlButtonOut', zoomOut);
    setButtonAction('planeControlButtonHome', home);

    onAnimationFrame();
};

function setButtonAction(id, funct) {
    document.getElementById(id).addEventListener('click', funct);
    document.getElementById(id).addEventListener('touchstart', funct);
}

function onAnimationFrame() {
    requestAnimationFrame( onAnimationFrame );
    if(input.dragDX !== 0) velocityX = input.dragDX;
    if(input.dragDY !== 0) velocityY = input.dragDY;
    
    checkHash();

    posX+= velocityX / (currentScale);
    posY+= velocityY / (currentScale);

    checkBoundaries();

    // Relative to center
    var posXAbsolute = ( - planeSize / 2 + document.documentElement.clientWidth / 2);
    var posYAbsolute = ( - planeSize / 2 + document.documentElement.clientHeight / 2);

    // Take scale in account
    posXAbsolute += posX * currentScale;
    posYAbsolute += posY * currentScale;

    //set the transform
    planeCanvas.style[prefixedTransform]= 'translate('+posXAbsolute+'px,'+posYAbsolute+'px) scale('+currentScale+') translateZ(0)';

    if (input.dragging) {
        velocityX = velocityX*velocityDecreaseOnHold;
        velocityY = velocityY*velocityDecreaseOnHold;
    } else if (input.isTouch) {
        velocityX = velocityX*velocityDecreaseTouch;
        velocityY = velocityY*velocityDecreaseTouch;
    } else {
        velocityX = velocityX*velocityDecrease;
        velocityY = velocityY*velocityDecrease;
    }

    input.dragDX=0;
    input.dragDY=0;
}

function checkHash() {
    var hash = window.location.hash;

    if (hash != lastHash) {

        var taskId = parseInt(hash.replace("#", ""));
        var task = data.tasks[taskId];

        if (task) {
            console.log("Redirecting to task", task);

            posX = -(task.location.x - planeSize / 2);
            posY = -(task.location.y - planeSize / 2);

            showDetail(taskId);

            lastHash = hash;
        }
    }
}

function onplaneMouseDown(event) {
    event.preventDefault();

    document.addEventListener('mouseup', onDocumentMouseUp);
    document.addEventListener('mousemove', onDocumentMouseMove);

    handleDragStart(event.clientX, event.clientY);
}

function onDocumentMouseMove(event) {
    handleDragging(event.clientX, event.clientY);
}

function onDocumentMouseUp(event) {
    event.preventDefault();
    
    document.removeEventListener('mouseup', onDocumentMouseUp);
    document.removeEventListener('mousemove', onDocumentMouseMove);
    
    handleDragStop();    
}

function onTouchStart(event) {
    event.preventDefault();
    input.isTouch = true;

    if(event.touches.length === 1){
        document.addEventListener('touchmove', onTouchMove);
        document.addEventListener('touchend', onTouchEnd);
        document.addEventListener('touchcancel', onTouchEnd);
        handleDragStart(event.touches[0].clientX * touchMultiplier, event.touches[0].clientY * touchMultiplier);
    } else if (event.touches.length === 2 ) {
        handleGestureStart(event.touches[0].clientX * touchMultiplier, event.touches[0].clientY * touchMultiplier,
            event.touches[1].clientX * touchMultiplier, event.touches[1].clientY * touchMultiplier);
    }
}

function onTouchMove(event) {
    event.preventDefault();

    if (event.touches.length  === 1){
        handleDragging(event.touches[0].clientX * touchMultiplier, event.touches[0].clientY * touchMultiplier);
    } else if( event.touches.length === 2 ){
        handleGesture(event.touches[0].clientX * touchMultiplier, event.touches[0].clientY * touchMultiplier,
            event.touches[1].clientX * touchMultiplier, event.touches[1].clientY * touchMultiplier);
    }
}

function onTouchEnd(event) {
    event.preventDefault();

    if (event.touches.length === 0 && input.dragging) {
        handleDragStop();
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        document.removeEventListener('touchcancel', onTouchEnd);
    } else if (event.touches.length === 1){
        handleGestureStop();
        handleDragStart(event.touches[0].clientX * touchMultiplier, event.touches[0].clientY * touchMultiplier);
    }
}

function indexOfPointer(pointerId){
    for (var i=0;i<input.pointers.length;i++){
        if(input.pointers[i].pointerId === pointerId) {
            return i;
        }
    }
    return -1;
}

function pointerDownHandler(event) {
    var pointerIndex=indexOfPointer(event.pointerId);
    input.isTouch = false;
    
    if (pointerIndex < 0) {
        input.pointers.push(event);
    } else {
        input.pointers[pointerIndex] = event;
    }

    if(input.pointers.length === 1) {
        handleDragStart(input.pointers[0].clientX , input.pointers[0].clientY);
        window.addEventListener("pointermove", pointerMoveHandler, false);
        window.addEventListener("pointerup", pointerUpHandler, false);
    } else if(input.pointers.length === 2){
        handleGestureStart(input.pointers[0].clientX, input.pointers[0].clientY, input.pointers[1].clientX, input.pointers[1].clientY );
    }
}

function pointerMoveHandler(event) {
    var pointerIndex=indexOfPointer(event.pointerId);

    if (pointerIndex<0) {
        input.pointers.push(event);
    } else {
        input.pointers[pointerIndex] = event;
    }

    if(input.pointers.length  === 1) {
        handleDragging(input.pointers[0].clientX, input.pointers[0].clientY);
    } else if (input.pointers.length === 2) {
        handleGesture(input.pointers[0].clientX, input.pointers[0].clientY, input.pointers[1].clientX, input.pointers[1].clientY );
    }
}

function pointerUpHandler(event) {
    var pointerIndex = indexOfPointer(event.pointerId);
    if (pointerIndex >= 0) {
        input.pointers.splice (pointerIndex, 1);
    }

    if(input.pointers.length === 0 && input.dragging){
        handleDragStop();
        window.removeEventListener("pointermove", pointerMoveHandler, false);
        window.removeEventListener("pointerup", pointerUpHandler, false);
    } else if(input.pointers.length === 1){
        handleGestureStop();
        handleDragStart(input.pointers[0].clientX, input.pointers[0].clientY);
    }

}
function handleDragStart(x ,y ){
    input.dragging = true;
    input.dragStartX = input.dragX = x;
    input.dragStartY = input.dragY = y;

    document.getElementById('planeContainer').classList.add("dragging");
}

function handleDragging(x ,y){
    if(input.dragging) {
        input.dragDX = x-input.dragX;
        input.dragDY = y-input.dragY;
        input.dragX = x;
        input.dragY = y;
    }
}

function handleDragStop(){
    if(input.dragging) {
        input.dragging = false;
        input.dragDX=0;
        input.dragDY=0;
    }

    document.getElementById('planeContainer').classList.remove("dragging");
}
function handleGestureStart(x1, y1, x2, y2){
    input.isGesture = true;
    
    //calculate distance and angle between fingers
    var dx = x2 - x1;
    var dy = y2 - y1;
    input.touchStartDistance=Math.sqrt(dx*dx+dy*dy);
    input.startScale=currentScale;
}
function handleGesture(x1, y1, x2, y2){
    if(input.isGesture){
        //calculate distance and angle between fingers
        var dx = x2 - x1;
        var dy = y2 - y1;
        var touchDistance=Math.sqrt(dx*dx+dy*dy);
        var scalePixelChange = touchDistance - input.touchStartDistance;

        currentScale = input.startScale * Math.pow(scaleVelocity, scalePixelChange);

        checkBoundaries();
    }
}
function handleGestureStop(){
    input.isGesture= false;
}

function mouseWheelHandler(event){
    var event = window.event || event; // old IE support
    var delta = ((event.wheelDelta || -event.detail) > 0) ? 1 : -1;

    currentScale *= Math.pow(scrollVelocity, delta);

    checkBoundaries();
}

function checkBoundaries() {
    if(currentScale <= minScale) {
        currentScale=minScale;
        document.getElementById("planeControlButtonOut").classList.add("disabled");
    } else {
        document.getElementById("planeControlButtonOut").classList.remove("disabled");
    }

    if(currentScale >= maxScale) {
        currentScale=maxScale;
        document.getElementById("planeControlButtonIn").classList.add("disabled");
    } else {
        document.getElementById("planeControlButtonIn").classList.remove("disabled");
    }

    if (posX > minMaxXY) { posX = minMaxXY; }
    if (posX < -minMaxXY) { posX = -minMaxXY ; }
    if (posY > minMaxXY) { posY = minMaxXY ; }
    if (posY < -minMaxXY) { posY = -minMaxXY ; }

    if (currentScale <= overviewTreshold) {
        document.getElementById('planeCanvas').classList.add("overview");
    } else {
        document.getElementById('planeCanvas').classList.remove("overview");
    }
}

function zoomIn() {
    currentScale *= buttonVelocity;
}

function zoomOut() {
    currentScale /= buttonVelocity;
}

function home() {
    currentScale = 1;
    posX = 0;
    posY = 0;
}