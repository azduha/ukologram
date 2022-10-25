<?php

//error_reporting(E_ERROR | E_PARSE);

function json($data) {
    header('Content-Type: application/json');
    echo json_encode(
        $data//, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE
    );
    die();
}

?>