# PROTÓTIPO (Godot 4.4): mapa top-down da cidade, lido da API do Codeniac, com um personagem andando.
# Setas ou WASD movem. Prédios bloqueiam o caminho (caixas simples). Cidade e sprites vêm do servidor/assets copiados.
extends Node2D

@export var servidor := "http://localhost:3000"
@export var email := ""
@export var senha := ""
@export var personagem := "res://assets/personagens/policial.png"
@export var velocidade := 120.0

const TAM_QUADRO := 64
const PASSOS := 4
const VELOCIDADE_ANIM := 9.0
const COR_GRAMA := Color("#4f8f3a")
const COR_ASFALTO := Color("#3d4048")
const COR_CALCADA := Color("#b9b3a6")

var _http: HTTPRequest
var _cidade := {}
var _caixas: Array[Rect2] = []
var _jogador: Sprite2D
var _pos := Vector2.ZERO
var _dir := 0
var _passo := 0.0
var _hud: Label
var _etapa := ""

func _ready() -> void:
	_http = HTTPRequest.new()
	add_child(_http)
	_http.request_completed.connect(_ao_responder)
	_hud = Label.new()
	var camada := CanvasLayer.new()
	add_child(camada)
	camada.add_child(_hud)
	_hud.position = Vector2(12, 8)
	if email != "" and senha != "":
		_login()
	else:
		_hud.text = "Defina email e senha no Inspector (ou no tópico de login) para carregar a cidade."

func _login() -> void:
	_etapa = "login"
	_hud.text = "Entrando…"
	var corpo := JSON.stringify({"email": email, "password": senha})
	_http.request(servidor + "/api/auth/login", ["Content-Type: application/json"], HTTPClient.METHOD_POST, corpo)

func _ao_responder(resultado: int, codigo: int, _cabecalhos: PackedStringArray, corpo: PackedByteArray) -> void:
	if resultado != HTTPRequest.RESULT_SUCCESS or codigo >= 400:
		_hud.text = "Falha (%s, código %d) na etapa: %s" % [resultado, codigo, _etapa]
		return
	var dados = JSON.parse_string(corpo.get_string_from_utf8())
	if _etapa == "login":
		_pegar_cidade(dados.get("token", ""))
	elif _etapa == "cidade":
		_cidade = dados
		_montar()

func _pegar_cidade(token: String) -> void:
	_etapa = "cidade"
	_http.request(servidor + "/api/godot/cidade", ["Authorization: Bearer " + token], HTTPClient.METHOD_GET)

func _montar() -> void:
	var mundo: Dictionary = _cidade["mundo"]
	_hud.text = "Vicewood (protótipo)  ·  setas/WASD andam"
	# construções: sprites nas posições da cidade, com caixa de colisão
	for c in _cidade["construcoes"]:
		var tex := _textura("res://assets/" + str(c["sprite"]) + ".png")
		if tex == null:
			continue
		var s := Sprite2D.new()
		s.texture = tex
		s.centered = false
		s.position = Vector2(c["x"], c["y"])
		s.scale = Vector2(c["w"] / tex.get_width(), c["h"] / tex.get_height())
		add_child(s)
		_caixas.append(Rect2(c["x"] + c["w"] * 0.06, c["y"] + c["h"] * 0.12, c["w"] * 0.88, c["h"] * 0.74))
	# personagem
	var folha := _textura(personagem)
	_jogador = Sprite2D.new()
	_jogador.texture = folha
	_jogador.region_enabled = true
	_jogador.region_rect = Rect2(0, 0, TAM_QUADRO, TAM_QUADRO)
	_jogador.centered = true
	add_child(_jogador)
	var ini: Dictionary = _cidade["inicio"]
	_pos = Vector2(ini["x"], ini["y"])
	# câmera seguindo o personagem, limitada ao tamanho da cidade
	var cam := Camera2D.new()
	cam.zoom = Vector2(1.6, 1.6)
	cam.position_smoothing_enabled = true
	cam.limit_left = 0
	cam.limit_top = 0
	cam.limit_right = int(mundo["largura"])
	cam.limit_bottom = int(mundo["altura"])
	_jogador.add_child(cam)
	cam.make_current()
	queue_redraw()

func _physics_process(delta: float) -> void:
	if _jogador == null:
		return
	var v := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if v != Vector2.ZERO:
		# direção da folha: 0 frente, 1 direita, 2 costas, 3 esquerda
		if absf(v.y) > absf(v.x):
			_dir = 0 if v.y > 0 else 2
		else:
			_dir = 1 if v.x > 0 else 3
		var prox := _pos + v.normalized() * velocidade * delta
		if not _bate(prox):
			_pos = prox
		_passo += delta * VELOCIDADE_ANIM
	else:
		_passo = 0.0
	_jogador.position = _pos
	var coluna := 0 if v == Vector2.ZERO else int(_passo) % PASSOS
	_jogador.region_rect = Rect2(coluna * TAM_QUADRO, _dir * TAM_QUADRO, TAM_QUADRO, TAM_QUADRO)
	_atualizar_hud()

# o "pé" do personagem (caixa pequena embaixo) não pode entrar nas construções
func _bate(p: Vector2) -> bool:
	var pe := Rect2(p.x - 6, p.y - 4, 12, 8)
	for c in _caixas:
		if c.intersects(pe):
			return true
	return false

func _atualizar_hud() -> void:
	var perto := ""
	var melhor := 90.0
	for p in _cidade.get("pontos", []):
		var d := _pos.distance_to(Vector2(p["x"], p["y"]))
		if d < melhor:
			melhor = d
			perto = p["nome"]
	_hud.text = "Vicewood (protótipo)  ·  setas/WASD andam" + ("\nPerto de: " + perto if perto != "" else "")

func _draw() -> void:
	if _cidade.is_empty():
		return
	var mundo: Dictionary = _cidade["mundo"]
	draw_rect(Rect2(0, 0, mundo["largura"], mundo["altura"]), COR_GRAMA)
	# vias: calçada (mais larga) por baixo, asfalto por cima
	for v in _cidade["vias"]:
		var a := Vector2(v["pts"][0], v["pts"][1])
		var b := Vector2(v["pts"][2], v["pts"][3])
		var w: float = v["w"]
		draw_line(a, b, COR_CALCADA, w + 22.0, true)
		draw_line(a, b, COR_ASFALTO, w, true)
	# marcas de pontos de interesse
	for p in _cidade.get("pontos", []):
		draw_circle(Vector2(p["x"], p["y"]), 4.0, Color("#f2c94c"))

func _textura(caminho: String) -> ImageTexture:
	var img := Image.load_from_file(caminho)
	if img == null:
		push_warning("sem imagem: " + caminho)
		return null
	return ImageTexture.create_from_image(img)
