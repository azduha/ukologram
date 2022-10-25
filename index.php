<?php $size = 20000; $board = isset($_GET['board'])?$_GET['board']:4; ?>

<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
        <link href="https://fonts.googleapis.com/css?family=Open+Sans:400,600,700" rel="stylesheet">

        <link rel="stylesheet" type="text/css" href="fa/css/font-awesome.min.css" />
        <script src="remarkable/dist/remarkable.js"></script>

        <link rel="stylesheet" type="text/css" href="style.css?a=<?php echo(rand()) /* Editing purposes... (disables caching) */ ?>" />
        <script src="script.js"></script>

        <link rel="stylesheet" type="text/css" href="plane/plane.css?a=<?php echo(rand()) /* Editing purposes... (disables caching) */ ?>" />
        <script src="plane/plane.js"></script>
         
        <title>Úkologram</title>
    </head>
    <body <?if (isset($_GET['dark'])) { echo('class="dark"'); }?> onLoad="planeInit(0, 0, <?php echo($size); ?>); mindmapInit(<?php echo($size.", '".strtolower($_SERVER['REMOTE_USER'])."', ".$board); ?>);">
        <div id="overlayContainer" class="hidden">
            <div id="overlayClose" onClick="closeDetail();"></div>
            <div id="taskDetail">
                <div id="taskDetailClose" class="fa fa-times" onClick="closeDetail();"></div>
                <h1 id="taskDetailTitle"><div class="hicon fa fa-gear"></div><span id="data-title"></span></h1>
                <div class="taskDetailColumn column-1">
                    <div class="taskDetailContentBlock">
                        <h2><div class="hicon fa fa-align-left"></div>Popis</h2>
                        <div id="data-content"></div>
                    </div>
                    <div class="taskDetailContentBlock">
                        <h2><div class="hicon fa fa-backward"></div>Předpoklady</h2>
                        <div id="data-prerequisities"></div>
                    </div>
                    <div class="taskDetailContentBlock">
                        <h2><div class="hicon fa fa-forward"></div>Závisí na tom</h2>
                        <div id="data-successors"></div>
                    </div>
                    <div class="taskDetailContentBlock">
                        <h2><div class="hicon fa fa-history"></div>Historie úprav</h2>
                        <div id="data-history"></div>
                    </div>
                </div>
                <div class="taskDetailColumn column-2">
                    <div class="taskDetailSidebarBlock">
                        <h4>Stav</h2>
                        <div id="data-status">
                            <div class="status blue" onmousedown="setStatus(0);" >Kdopak si mě vezme?</div>
                            <div class="status red" onmousedown="setStatus(1);" >Kde nic, tu nic</div>
                            <div class="status yellow" onmousedown="setStatus(2);">Makám na tom!</div>
                            <div class="status green" onmousedown="setStatus(3);">Mám to hotové!</div>
                            <div class="status black" onmousedown="setStatus(4);">Až na táboře...</div>
                        </div>
                    </div>
                    <div class="taskDetailSidebarBlock">
                        <h4>Štítky</h2>
                        <div id="data-tags"></div>
                    </div>
                    <div class="taskDetailSidebarBlock">
                        <h4>Umpalumpové</h2>
                        <div id="data-assignee"></div>
                    </div>
                    <div class="taskDetailSidebarBlock">
                        <h4>Smazat</h2>
                        <input type="text" id="data-captcha" value="NE">
                        <i class="fa fa-trash deleteButton" onClick="removeTask();"></i>
                        <br/>
                        Napiš 'ANO', pokud chceš opravdu smazat tenhle úkol!
                    </div>
                </div>
            </div>
        </div>
        <div id="planeContainer" class="diagram-only">
            <div id="planeCanvas">
                <!--<div id="planeTouch"></div>-->
                <svg width="100%" height="100%" id="planeSVG">
                    <marker id="arrow" markerWidth="6" markerHeight="6" orient="auto" refY="3">
                        <path d="M0,0 L6,3 0,6" />
                    </marker>
                    <image class="undragable" href="img/bg.svg" height="100%" width="100%"/>

                    <!-- LOCATION FOR TASK CONNECTIONS -->
                </svg>

                <!-- LOCATION FOR TASKS -->
            </div>

            <div class="planeControl diagram-only">
                <a class="planeControlButton fa fa-plus" id="planeControlButtonIn" href="#" title="Přiblížit" role="button"></a>
                <a class="planeControlButton fa fa-home" id="planeControlButtonHome" href="#" title="Výchozí zobrazení" role="button"></a>
                <a class="planeControlButton fa fa-minus" id="planeControlButtonOut" href="#" title="Oddálit" role="button"></a>
            </div>
            <div id="footer">
                Právě je online: <strong id="data-online"></strong>
            </div>
        </div>
        <div id="listContainer" class="list-only">

        </div>
        <div id="menuContainer">
            <span class="no-mobile diagram-only">
            <div class="button fa fa-sticky-note-o" title="Vytvořit úkol" id="buttonTask" onclick="buttonTask();"></div>
            <div class="button fa fa-arrows-h" title="Vytvořit čáru" id="buttonLine" onclick="buttonLine();"></div>
            <div class="separator"></div>
            </span>
            <!--<div class="button fa fa-eye list-only" title="Zobrazit všechny sloupce" onclick="toggleAllColumns();"></div>-->
            <div class="button fa fa-list" title="Přepnout zobrazení" id="buttonToggleView" onclick="toggleView();"></div>
            <div class="separator"></div>
            <div class="button fa fa-filter" title="Nastavit filtr" id="buttonFilter" onclick="openFilter();"></div>
            <div class="button fa fa-bell" title="Otevřít upozornění" id="buttonNotify" onclick="openNotify();"></div>
        </div>
        <div id="menuOverlayContainer" class="hidden">
            <div id="overlayClose" onmousedown="closeMenu();"></div>
            <div id="menu-notify" class="menu">
                <div class="scrollContainer" id="data-notifications">
                    <a href="*" class="notifyClearAll">Označit vše, jako přečtené</a>
                </div>
            </div>
            <div id="menu-filter" class="menu">
            </div>
        </div>
        <!--<div id="sidebarContainer">
            <div class="tag add" style="background: rgb(170, 13, 13) none repeat scroll 0% 0%; color: rgb(255, 255, 255);">Důležité</div><div class="tag add" style="background: rgb(13, 136, 0) none repeat scroll 0% 0%; color: rgb(255, 255, 255);">Nákup</div><div class="tag add" style="background: rgb(247, 255, 40) none repeat scroll 0% 0%; color: rgb(37, 37, 37);">Tisk</div><div class="tag add" style="background: rgb(49, 51, 255) none repeat scroll 0% 0%; color: rgb(255, 255, 255);">Nice to have</div><div class="tag add" style="background: rgb(245, 72, 215) none repeat scroll 0% 0%; color: rgb(37, 37, 37);">Zafóliovat</div><div class="tag add" style="background: rgb(21, 21, 21) none repeat scroll 0% 0%; color: rgb(255, 255, 255);">Až na táboře...</div>
        </div>-->
    </body>
</html>