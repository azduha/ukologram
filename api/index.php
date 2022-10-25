<?php
// Allow Requests From Any Domain
header('Access-Control-Allow-Origin: *');

// Dependencies
require './_config.php';
require './Slim/Slim/Slim.php';
\Slim\Slim::registerAutoloader();
require './ezSQL/shared/ez_sql_core.php';
require './ezSQL/mysqli/ez_sql_mysqli.php';

// Instantiate Slim
$app = new \Slim\Slim();

// Redirect requests with no method call
$app->get('/', function(){ header('Location: ../'); exit(); });

// Add an HTTP GET route that returns static result
$app->post('/all', 'UkologramRestAPI::all');
$app->post('/history', 'UkologramRestAPI::history');
$app->post('/single', 'UkologramRestAPI::single');
$app->post('/update', 'UkologramRestAPI::update');
$app->post('/delete', 'UkologramRestAPI::delete');
$app->post('/insert', 'UkologramRestAPI::insert');
$app->post('/duplicate', 'UkologramRestAPI::duplicate');

// Go!
$app->run();

// Create ezSQL Database Instance

class Database
{
	private static $instance;

	private function __construct()
	{
	}

	public static function instance()
	{
		return self::$instance ? self::$instance : self::$instance = new ezSQL_mysqli($db['username'], $db['password'], $db['database'], $db['host']);
	}
}

// Create API Class & Methods

class UkologramRestAPI
{
	private static function db()
	{
		return Database::instance();
	}

	private static function updateVersion($board_id) {
		echo "<br/>BOARD ID: ".$board_id."<br/>";
		echo self::db()->query("UPDATE gram_boards SET `version` = `version` + 1 WHERE `id` = ".$board_id);
	}

	private static function checkJsonData() {
		$json_data = json_decode(\Slim\Slim::getInstance()->request()->getBody(), true);

		if(! preg_match("/^gram_.*$/", $json_data["table"])) {
			echo json_encode(array("error" => "SQL queiries can be called only on gram_-* tables!"));

			exit();
		}

		return $json_data;
	}

	public static function update() {
		$json_data = self::checkJsonData();

		if (!isset($json_data["where"]["board_id"])) {
			echo "No board ID";
			exit();
		}
		$board_id = $json_data["where"]["board_id"];

		$query = self::createUpdateQuery($json_data["table"], $json_data["values"], $json_data["where"]);

		echo $query;

		echo "JSON_DATA: ". json_encode($json_data);
		echo "<br>";
		echo "QUERY: ". $query;
		echo "<br>";

		echo self::db()->query($query);

		self::updateVersion($board_id);

		exit();
	}

	private static function createUpdateQuery($table, $values, $where=array("1" => "1")) {
		$values_str = "";
		foreach($values as $key => $value) {
			$values_str .= '`'.$key.'` = \''.$value.'\', ';
		}
		$values_str = preg_replace("/\s*,\s*$/", "", $values_str);

		$where_str = "";
		foreach($where as $key => $value) {
			$where_str .= '`'.$key.'` = \''.$value.'\' AND ';
		}
		$where_str = preg_replace("/s*\w+\s*$/", "", $where_str);

		$query = 'UPDATE '.$table.' SET '.$values_str.' WHERE '.$where_str;

		return $query;
	}

	public static function delete() {
		$json_data = self::checkJsonData();

		if (!isset($json_data["where"]["board_id"])) {
			echo "No board ID";
			exit();
		}
		$board_id = $json_data["where"]["board_id"];

		$query = self::createDeleteQuery($json_data["table"], $json_data["where"]);

		echo "JSON_DATA: ". json_encode($json_data);
		echo "<br>";
		echo "QUERY: ". $query;
		echo "<br>";

		echo self::db()->query($query);

		self::updateVersion($board_id);

		exit();
	}

	private static function createDeleteQuery($table, $where) {
		$where_str = "";
		foreach($where as $key => $value) {
			$where_str .= '`'.$key.'` = \''.$value.'\' AND ';
		}
		$where_str = preg_replace("/s*\w+\s*$/", "", $where_str);

		$query = 'DELETE FROM '.$table.' WHERE '.$where_str;

		return $query;
	}

	public static function insert() {
		$json_data = self::checkJsonData();

		if (!isset($json_data["values"][0]["board_id"])) {
			echo "No board ID";
			exit();
		}
		$board_id = $json_data["values"][0]["board_id"];

		$query = self::createInsertQuery($json_data["table"], $json_data["values"]);

		echo "JSON_DATA: ". json_encode($json_data);
		echo "<br>";
		echo "QUERY: ". $query;
		echo "<br>";

		echo self::db()->query($query);

		self::updateVersion($board_id);

		exit();
	}

	private static function createInsertQuery($table, $values) {
		$values_str = '';
		$keys = '';
		foreach($values as $key => $value) {
			$keys = '';
			$values_str .= '(';
			foreach($value as $k => $v) {
				$keys .= '`'.$k.'`, ';
				$values_str .= '\''.$v.'\', ';
			}
			$values_str = preg_replace("/s*,\s*$/", "", $values_str);
			$values_str .= '), ';
		}
		$keys = preg_replace("/s*,\s*$/", "", $keys);
		$values_str = preg_replace("/s*,\s*$/", "", $values_str);

		$query = 'INSERT INTO '.$table.' ('.$keys.') VALUES '.$values_str;

		return $query;
	}

	public static function single() {
		$json_data = json_decode(\Slim\Slim::getInstance()->request()->getBody(), true);
		
		if (!isset($json_data["board_id"])) {
			return self::output(array());
		}
		$board_id = $json_data["board_id"];
		
		$query_gram_task = 'SELECT * FROM gram_task WHERE `board_id` = '.$board_id.' AND `id` = '.$json_data["id"];

		if(!isset($json_data["id"]) || !$results_gram_task = self::db()->get_row($query_gram_task)){
			$results_gram_task = array();
		}

		return self::output($results_gram_task);
	}

	public static function history() {
		$json_data = json_decode(\Slim\Slim::getInstance()->request()->getBody(), true);

		if (!isset($json_data["board_id"])) {
			return self::output(array());
		}
		$board_id = $json_data["board_id"];

		$query_gram_notify = 'SELECT * FROM gram_notify WHERE `assignee_id` = 0 AND `task_id` = '.$json_data["id"].' AND `board_id` = '.$board_id.' ORDER BY id DESC';

		if(!isset($json_data["id"]) || !$result_gram_notify = self::db()->get_results($query_gram_notify)){
			$result_gram_notify = array();
		}

		return self::output(array(
			"gram_notify" => $result_gram_notify
		));
	}

	public static function all() {
		$json_data = json_decode(\Slim\Slim::getInstance()->request()->getBody(), true);

		if (!$json_data["board_id"]) {
			return self::output(array(
				"post_data" => $json_data
			));
		}
		$board_id = $json_data["board_id"];

		$query_version = 'SELECT version FROM gram_boards WHERE `id` = '.$board_id;
		$version = self::db()->get_var($query_version);
		$query_board = 'SELECT title FROM gram_boards WHERE `id` = '.$board_id;
		$board = self::db()->get_var($query_board);
		$query_user = 'SELECT id FROM gram_assignee WHERE `board_id` = '.$board_id.' AND `nickname` = \''.$json_data["nickname"].'\'';
		$user = self::db()->get_var($query_user);

		// Return Assignees in all cases
		
		if ($user) {
			if (array_key_exists("x", $json_data) && array_key_exists("y", $json_data)) {
				self::db()->query("UPDATE gram_assignee SET last_online = now(), last_x = ".$json_data["x"].", last_y = ".$json_data["y"]." WHERE board_id = ".$board_id." AND id = ".$user);
			} else {
				self::db()->query("UPDATE gram_assignee SET last_online = now() WHERE board_id = ".$board_id." AND id = ".$user);
			}
		}

		if ($json_data["version"] == $version) {
			$query_gram_assignee = 'SELECT id, last_online, last_x, last_y FROM gram_assignee WHERE `board_id` = '.$board_id.' ORDER BY id ASC';
			if(!$results_gram_assignee = self::db()->get_results($query_gram_assignee)){
				$results_gram_assignee = array();
			}

			return self::output(array(
				"version" => $version,
				"gram_assignee" => $results_gram_assignee,
			));
		}

		$query_gram_connection = 'SELECT * FROM gram_connection WHERE `board_id` = '.$board_id.' ORDER BY id ASC';
		$query_gram_tag = 'SELECT * FROM gram_tag WHERE `board_id` = '.$board_id.' ORDER BY id ASC';
		$query_gram_task = 'SELECT * FROM gram_task WHERE `board_id` = '.$board_id.' AND removed = 0 ORDER BY id ASC';
		$query_gram_task_assignee = 'SELECT * FROM gram_task_assignee WHERE `board_id` = '.$board_id.' ORDER BY id ASC';
		$query_gram_task_tag = 'SELECT * FROM gram_task_tag WHERE `board_id` = '.$board_id.' ORDER BY id ASC';
		$query_gram_notify = 'SELECT * FROM gram_notify WHERE `assignee_id` = '.$user.' AND `board_id` = '.$board_id.' ORDER BY id DESC';
		$query_gram_assignee = 'SELECT * FROM gram_assignee WHERE `board_id` = '.$board_id.' ORDER BY id ASC';

		if(!$results_gram_connection = self::db()->get_results($query_gram_connection)){
			$results_gram_connection = array();
		}
		if(!$results_gram_tag = self::db()->get_results($query_gram_tag)){
			$results_gram_tag = array();
		}
		if(!$results_gram_task = self::db()->get_results($query_gram_task)){
			$results_gram_task = array();
		}
		if(!$results_gram_task_assignee = self::db()->get_results($query_gram_task_assignee)){
			$results_gram_task_assignee = array();
		}
		if(!$results_gram_task_tag = self::db()->get_results($query_gram_task_tag)){
			$results_gram_task_tag = array();
		}
		if ($user) {
			if(!$result_gram_notify = self::db()->get_results($query_gram_notify)){
				$result_gram_notify = array();
			}
		} else {
			$result_gram_notify = array();
		}
		if(!$results_gram_assignee = self::db()->get_results($query_gram_assignee)){
			$results_gram_assignee = array();
		}

		return self::output(array(
			"version" => $version,
			"board_id" => $board,
			"gram_assignee" => $results_gram_assignee,
			"gram_connection" => $results_gram_connection,
			"gram_link" => $results_gram_link,
			"gram_tag" => $results_gram_tag,
			"gram_task" => $results_gram_task,
			"gram_task_assignee" => $results_gram_task_assignee,
			"gram_task_link" => $results_gram_task_link,
			"gram_task_tag" => $results_gram_task_tag,
			"gram_notify" => $result_gram_notify,
			/*"debug" => array(
				"user request" => $query_user,
				"user response" => $user,
				"update" => "UPDATE gram_assignee SET last_online = now() WHERE board_id = ".$board_id." AND id = ".$user
			)*/
		));
	}

	public static function duplicate() {
		$json_data = json_decode(\Slim\Slim::getInstance()->request()->getBody(), true);
		
		if (!isset($json_data["source"])) {
			exit();
		}
		if (!isset($json_data["title"])) {
			exit();
		}

		$old_id = $json_data["source"];
		$title = $json_data["title"];
		
		self::db()->query("INSERT INTO gram_boards (title) VALUES ('" + $title + "')");
		/*
		$new_id = self::db()->get_var('SELECT id FROM `gram_boards` ORDER BY id DESC LIMIT 1');

		self::db()->query('INSERT INTO gram_assignee (title, nickname, last_online, last_x, last_y, board_id, source_id) SELECT title, nickname, last_online, last_x, last_y, '.$new_id.', id FROM gram_assignee WHERE board_id = '.$old_id);
		self::db()->query('INSERT INTO gram_task (title, content, location_x, location_y, status, removed, image, board_id, source_id) SELECT title, content, location_x, location_y, status, removed, image, '.$new_id.', id FROM gram_task WHERE board_id = '.$old_id);
		self::db()->query('INSERT INTO gram_connection (from_id, to_id, board_id) SELECT (SELECT gram_task.id FROM gram_task WHERE source_id = from_id), (SELECT gram_task.id FROM gram_task WHERE source_id = to_id), '.$new_id.' FROM gram_connection WHERE board_id = '.$old_id);
		self::db()->query('INSERT INTO gram_task_assignee (id_task, id_assignee, board_id) SELECT (SELECT gram_task.id FROM gram_task WHERE source_id = id_task), (SELECT gram_assignee.id FROM gram_assignee WHERE source_id = id_assignee), '.$new_id.' FROM gram_task_assignee WHERE board_id = '.$old_id);
		self::db()->query('INSERT INTO gram_task_tag (id_task, id_tag, board_id) SELECT (SELECT gram_task.id FROM gram_task WHERE source_id = id_task), (SELECT gram_tag.id FROM gram_tag WHERE source_id = id_tag), '.$new_id.' FROM gram_task_tag WHERE board_id = '.$old_id);
		*/

		//exit();
	}

	private static function output( $data ) {
		header("Content-Type: application/json; charset=utf-8");

		echo json_encode($data);

		exit();
	}
}