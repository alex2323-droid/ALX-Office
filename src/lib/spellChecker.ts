const CUSTOM_DICT_STORAGE_KEY = 'alx_office_custom_dict_v1';

export interface SpellErrorMatch {
  id: string;
  word: string;
  normalized: string;
  range: Range;
}

/**
 * Compact Spanish + office technical vocabulary with controlled morphological expansion.
 * Works 100% offline inside the ALX Office PWA.
 */
const CORE_WORDS_RAW = `
a abajo abandono abierto abierta abrir acabar acaso acción acciones aceptar acerca
acceso accesible accesibilidad accionista acompañar acordar acuerdo acuerdos adaptar
adecuar adecuado adecuada además adentro adherir adicción adicional adjuntar
adjunto administración administrar administrativo admitir adoptar adquirir adquisición
adverso advertir aéreo afectar afecto afirmar afortunado afuera agencia agenda
agente ágil agilidad agotar agradable agradecer agradecimiento agregar agrupar
agua agudo aguja ahí ahora aire ajeno ajustar ajuste ajustes al alcanzar alegrar
alegre alegría alejar alemán algo alguien algún alguna algunas algunos aliento
alimentar alimento allá allí alma almacenar almacén almuerzo alojar alrededor
alta altas alto altos altura alumbrar alumno alzar ama amable amar amargo amarillo
ambiente ámbito ambos amenaza amenazar amigo amiga amistad amo amor ampliar amplio
amplia análisis analizar ancho anciano andar ando anexo ángel ángulo ánima
animal animar ánimo anoche ansia ante anterior antes anticipar antiguo antigua
anual anunciar anuncio añadir año años apagar aparato aparecer apariencia apartar
aparte apenas apertura apetito aplicar aplicación aplicaciones apoyar apoyo apreciar
aprender aprendizaje apretar aprobar aprovechar aproximar apto apuntar apunte aquí
araña árbol archivo archivos arco arder área áreas arena argumento arma armar
armario armonía aroma arrancar arrastrar arreglar arreglo arriba arriesgar arrojar
arroz arte artículo artículos artista asegurar asentar así asiento asignar asistir
asistente asistentes asociar asomar aspecto aspectos aspirar asunto asustar atacar
atajo ataque atar atención atender atento atenuar aterrizar atestiguar atlas atmósfera
atrás atravesar atrever atribuir audacia audiencia auditar auditoría aula aumentar
aumento aún aunque auténtico auto autoevaluación autonomía autor autora autoridad
autorización autorizar avance avances avanzar ave avenida aventura averiguar aviso
ayer ayudar ayuda ayuno azar azul azúcar
bajar bajo baja balance balancear balanza balón banco banda bandera baño barajar
barato barba barco barra barrer barrera barrio barro base básico básica bastante
bastar basura batalla batir baúl beber bebida beca bello belleza beneficiar beneficio
beneficios besar beso biblioteca bien bienes bienestar bienvenido bienvenida billete
biología blanco blanca blando bloque bloques bloquear boca boda bodega bola boleto
bolsa bolsillo bomba bombero bondad bonito bonita bordar borde borrar bosque bota
botar botella botón botones brasa brazo breve brevedad brillante brillar brincar
brindar brisa brotar brote bruja bruto bueno buena buenas buenos bufete buque
burla burlar buscar búsqueda búsquedas
caballero caballo cabellera cabello caber cabeza cabo cabra cada cadena cadera
caer café caída caja cajón calamar calcular cálculo calendario calidad cálido cálida
calificar calificación calle callar calma calmar calor caloría calvo cama cámara
cambiar cambio cambios caminar camino camión camisa campana campaña campeón campo
canal cancelar canción candidato candado canela cansar cantar cantidad canto capa
capacidad capaz capital capítulo capricho capturar cara carácter característica
características caracteres caramba carbón cárcel carecer carga cargar cargo cariño
carne caro carrera carretera carro carta cartera cartón casa casar cáscara casi
casilla casillas caso casos castigar castigo casual catalán catálogo categoría
causa causar cautela cazar cebada cebolla ceder ceja celda celebrar célebre celo
célula cemento cena cenar ceniza censura centena centenar centrar centro cepillo
cerca cercano cerdo cerebro ceremonia cero cerrar cerro certeza certificado cesar
césped cesta cesto chaleco chaqueta charco charla charlar chasis chiste chocar
chocolate choque chorro cicatriz ciego cielo cien ciento ciencia científico
cierto cierta cierre cifra cifrar cigarro cima cinco cine cinta cintura circular
círculo circunstancia cita citar ciudad ciudadano ciudadana civil civilización claro
clara claridad clase clases clásico clásica clavar clave clavo cliente clientes
clima clínica club cobrar cobre cobro cocina cocinar cocinero coche coco codicia
código códigos codo coger cohete coincidencia coincidir cola colaborar colaboración
colchón colección colecta colectivo colegio colgar colina collar colocar coloquio
color colores columna columnas combinar combinación comentar comentario comentarios
comenzar comer comercial comerciante comercio cometa cometer cómico comida comienzo
comisión comité como cómoda cómodo compañía compañero compañera comparar comparativa
compartir compás compasión compatible compatibilidad compendio compensar competencia
competir complacer complejo compleja complementar complemento completar completo
completa complicar componer comportamiento comportar compra comprar comprender
comprensión comprobar comprometer compromiso compuerta compuesto computación común
comunicación comunicar comunidad con concebir conceder concentrar concepto conceptos
concernir concertar conciencia concluir conclusión conclusiones concreto concreta
concurrencia concurso conde condenar condición condiciones conducir conducta conectar
conejo conexión confesar confianza confiar confirmar conflicto conformar conforme
confortar confundir confusión congelar congreso conjunto conmemorar conmover conocer
conocimiento conquistar consciente consecuencia consecuencias conseguir consejo
consentir conservar considerar considerable consigna consistir consolar consolidar
constancia constante constar constituir construir construcción consultar consulta
consultas consumir consumo contacto contar contemplar contemporáneo contener contenido
contenidos contento contestar contexto contienda contiguo continuar continuo continua
contra contradecir contraer contrario contraste contrato contribuir contribución
control controlar convencer conveniencia convenir convenio convento conversar conversación
convertir convicción convidar convocar copa copiar copia copias coraje corazón
corbata corcho cordero cordial cordillera cordón corona coronel corpóreo corral
correcto correcta corregir corrección correo correr corresponder corrida corriente
corromper cortar corte cortesía cortina corto corta cosa cosas cosecha coser costa
costar coste costo costumbre costuras cotidiano crecer crecimiento crédito creer
crema crepúsculo creyente cría criado criar crimen criminal crisis cristal criterio
crítica criticar crónica cronograma cruce cruzar cuaderno cuadro cual cuales cualquier
cualquiera cuán cuando cuanto cuánta cuantos cuantas cuarto cuarta cuatro cubrir
cuchara cuchillo cuello cuenta cuentas cuento cuerda cuerno cuero cuerpo cuesta
cuidado cuidar culebra culpa culpar cultivar cultivo cultura cumbre cumplir cumplimiento
cuna cuota cupo cura curar curiosidad curioso cursiva curso curva custodia cuyo cuya
dado dama daño dañar dar dato datos de debajo deber debido debida débil debilidad
década decano decena decidir decisión decisiones decir decisivo declaración declarar
decorar decreto dedicar dedo deducir defecto defender defensa definir definitivo
definitiva dejar del delante delegar delito delgado demanda demandar demás demasiado
democracia demora demostrar demostración denotar dentro denuncia denunciar departamento
depender dependencia dependencias depositar depósito derecha derecho derechos derivar
derramar derretir derribar derrota derrotar desagradable desaparecer desarrollar desarrollo
desastre desatar desayunar desayuno descansar descanso descargar descender descenso
descifrar describir descripción descubrir descubrimiento descuidar desde desear deseo
desempeño desencadenar desenlace deshacer desierto designar desigual desinterés
deslizable deslizables deslizar desmayar desnudar desnudo desorden despachar despacho
despedida despedir despegar despertar despierto desplazar desplazamiento desplegable
desplegar despreciar después destacar destacado destacados detalle detalles detectar
detener deterioro determinar detrás deuda deudor devolver día diario días dibujar
dibujo dicción diccionario dicha dicho dichos diciembre dictar diente dieta diez
diferencia diferenciar diferente diferentes difícil dificultad difundir difusión
digno digna dilatar diligencia dimensión dimensiones disminuir dinero dios diosa
diploma dirección directo directa dirigir disciplina disco discreto disculpa disculpar
discurso discutir diseñar diseño diseños disfrazar disfrutar disgusto disminuir
disolver disparar disparo dispensar disponer dispositivo dispositivos disposición
distancia distante distinto distinta distribuir distribución distrito diversificación
diverso divertida divertir dividir división divorcio divulgar doblar doble doce
docena docencia docente doctor doctrina documento documentación documental documentos dólar
doler dolor dolencia domesticar domicilio dominar dominio domingo don donación donar
donde dónde dorado dormir dos dosis dotar dote drama drástico droga ducha dudar duda dudas
duelo dueño dueña dulce dulzura dúo duque durar duración durante duro dura
e echar eco economía económico económica ecuación edad edición editar editor editorial
editable editables educar educación efectivo efectiva efecto efectos efectuar eficaz eficacia eficiencia
eficiente esfuerzo egoísmo eje ejecución ejecutar ejecutivo ejecutiva ejemplar ejemplo
ejercer ejercicio ejército el elaboración elaborar elástico elección elegir elemento
elementos elevar elocuente elogiar elogio ellas ellos email embajada embarcar embargo
emblema emitir emoción emocional empacar empanada empatar empujar empeño empezar
empleado emplear empleo emprender empresa empresario empresas empujón en enamorar
encajar encaminar encantar encanto encargar encargo encender encerrar encima encoger
encontrar encuentro encuesta encuestas ende enderezar enemigo energía energético
enero enfadar enfermedad enfermo enfocar enfoque enfrentar enfriar engañar engendrar
enigma enlace enlazar enojar enorme enredar enriquecer ensayar ensayo enseñar enseñanza
entender entendimiento enterar entero entera enterrar entonces entrada entrar entre
entrega entregable entregar entretener entrevista enumerar envase envejecer enviar
envidia envío envolver episodio época equilibrar equilibrio equipaje equipo equipos
equivaler equivocar era erguir ergonomía erigir errar error errores es escala escalar
escalera escándalo escaneo escapar escape escasez escena escenario esclarecer escoger
escolar esconder escribir escrito escritor escritura escuchar escuela esculpir escultura
ese esencial esfuerzo esmero eso esos espacio espacial espalda espantar espanto
español española especial especialista especializado especializar especie
especificación especificaciones específico específica espectáculo espejo esperar
esperanza espeso espía espina espiral espíritu espiritual espléndido esposa esposo
espuma esquema esquiar esquina está estable establecer establecimiento estación
estadística estado estados estallar estampa estampar estándar estanque estante estar
estatua estatura este estilo estilos estimar estímulo esto estómago estorbar estos
estrechar estrecho estrella estremecer estrenar estricto estructura estructurado
estructurada estructurar estudiante estudiar estudio estudios estufa etapa etapas
eterno ética etiqueta evaluar evaluación evangelio evento eventual evidencia evidente
evitar evolución evolucionar exacto exacta exagerar examen examinar exceder excelente
excepción excepto excesivo exceso excitar exclamar excluir exclusiva exclusivo excusa
exhibir exigir existencia existir éxito exitoso éxodo expandir expandible expansión
expectativa expedición experiencia experimentar experimento experto explicar explicación
explícito explorar explosión explotar exponer exportar exportación exposición expresar
expresión exprimir expulsar extender extensión extenso extensa exterior externo
extinguir extraer extraño extraña extraordinario extremo
fábrica fabricar fábula fácil facilidad facilitar factor factores factura facultad
faena falda fallar fallo falsa falso falta faltar fama familia familiar famosos
famoso fantasma fantasía farmacia farol fascinar fase fastidio fatal fatiga favor
favorable favorecer favorito febrero fecha fechas fecundo federal felicidad feliz
femenino fenómeno feo feriado feria feroz ferrocarril fértil fervor festejar fiesta
figura figurar fijar fijo fila filete filo filosofía fin final finalidad finalmente
financiar financiero finca fingir fino firma firmar firme firmeza fiscal físico física
flaco flama flanco flauta flecha flexible flor florecer flota flotar fluidez fluir
flujo foco fogón folio folleto fomentar fondo fondos forma formación formal formar
formato formatos fórmula formular foro fortalecer fortaleza fortuito fortuna forzar
fosa foto fotografía fracción fracasar fracaso frágil fragmento fragancia francés
francia franco franja franqueza frase frazada frecuencia frecuente fresa fresco fresca
frialdad fricción frío fría frito frontera frotar fruto fruta fuego fuente fuentes
fuera fuerte fuertemente fuerza fuga fugar fumar función funcional funcionar
funcionamiento funciones funda fundamentar fundamento fundar fundir funeral furia
furioso fusil fútbol futuro futura
gafas gala galán galería galleta gallina gallo ganar ganancia ganga gancho garaje
garantía garantizar garbanzo garganta garra gas gasolina gastar gasto gatos gato
gaveta gemelo gemir general generalmente generar género generoso genio gente
gentil geografía geometría gerente gesto gestos gestión gestionar gestor gigante gimnasio
girar giro gitano globo gloria glotón gobernar gobierno gol golpe golpear goma
gordo gorra gota gozar gozo grabar gracia gracias gracioso grado graduar gráfico
gráfica gramo gran grande grandeza granero granja grano grasa gratis gratuito grave
gravedad griego grieta grillo gripe gris gritar grito grosero grueso grupo grupos
guante guapo guarda guardar guardia guarnición guerra guerrero guía guiar guión
guisar guitarra gusano gustar gusto gama
haber hábil habilidad habitar habitación hábito habitual hablar hacer hacia hacienda
hada hallar hallazgo hambre hambriento harina hartar harto hasta hazaña hebra hecho
hechos helada helado helar hembra heredar heredero herencia herida herir hermana
hermano hermoso hermosura héroe heroico herradura herramienta herramientas hervir
hielo hierba hierro hígado hija hijo hilo himno hinchar hipervínculo hipótesis
historia histórico hogar hoja hojas hola holgazán hombre hombro homenaje hondo
honesto hongo honor honra honrar hora horario horas horizontal horizonte hormiga
horno horror hospital hospedar hostil hotel hoy hoyo hueco huella huérfano huerta
hueso huésped huevo huir humano humanidad húmedo humilde humildad humo humor
hundir huracán hurtar
ida idea ideal ideales idear idéntico identificar identidad idioma ídolo iglesia
ignorar igual igualmente ilegal ileso iluminar ilusión ilustrar imagen imágenes
imaginar imán imitar impaciencia impedir imperio implantar implementar implementación
implicar imponer importancia importante importar importe imposible impresionar
impresora imprimir impropio improvisar impulso inactivo inaugurar incapaz incendio
incertidumbre incidir incidente incluir inclusive incluso incómodo incorporar
incrédulo incrementar incremento incurrir indicar indicador indicadores índice
indiferente indígena indigno indirecto individuo índole inducir industria inercia
inesperado inevitable infantil infeliz inferior infierno infinito inflamación
influencia influir información informar informática informe informes ingeniería ingeniero
ingeniera ingenio ingenuo ingrato ingresar ingreso iniciar inicial iniciales
inicio injuria injusto inmediato inmenso inmersión inminente inmortal inmóvil
inmueble innovación innumerable inocente inquieto inquietud inscribir insecto
inseguro insertar inserción insistir inspeccionar inspirar instalar instalación
instante instar instinto instituir institución instrucción instruir instrumento
insultar insulto íntegro intelectual inteligencia inteligente intentar intento
intercambio interés interesar interesante interior interlineado intermedio interno
interpretar interrumpir intervalo intervenir intervención íntimo intriga introducir
introducción inundar inútil invadir invalidar inválido invasión inventar invento
inventario invertir inverso investigación investigar invierno invitar invitación
inyección ir ira iris ironía irradiar irregular irresponsable irrumpir isla
izquierda izquierdo
jabón jactar jadear jamás jamón jarabe jardín jarra jarro jaula jefe jefa jerga
jinete jirafa joven joya júbilo judicial juego jugador jueves juez jugar juguete
juicio julio junio juntar junto justa justicia justificar justo juventud juzgar
kilo kilómetro
la las labio labor laboral laboratorio labrar ladera lado ladrar ladrillo ladrón
lagarto lago lágrima laguna lamentar lamento lámina lámpara lana lanza lanzar
lápiz largo larga largura lástima lastimar lata latencia lateral látigo latir
latín laurel lavar lazo leal lealtad lección leche lecho lector lectura leer
legado legal legar legible legión legislar legítimo legua lejano lejos lengua
lenguaje leño lento lenta lentitud león lepra lesión letal letra letras letrero
levantar leve leyenda ley leyes liar liberal liberar libertad librar libre
librería libro libros licencia licor líder lidiar liebre lienzo liga ligar
ligero lima limitar límite límites limón limpiar limpio limpieza linaje lindo
línea lineal líneas lino linterna lío liquidar líquido lirio liso lista listas
listo litera literatura litro llamada llamar llano llanta llanto llave llegar
llenar lleno llevar llorar llover lluvia lo los lobo local localización localizar
locales loco locura lodazal lodo lograr logro loma lomo lona longitud lote loza
lucha luchar lucir luego lugar lugares lujo lumbre luminoso luna lunes lupa luz
lanzamiento
maceta macho madera madrastra madre madrugada madurar maduro maestra maestro
magia mágico magistrado magnífico mago maíz majestad mal maldad maldecir maleta
maleza maligno malo maltratar malvado mamá mañana mancha manchar mandar mandato
mando manejar manejo manera manga mango manifestar manifiesto maniobra manipular
mano manos manso manta mantener manto manual manuales manuscrita manuscrito
manzana mapa máquina mar maravilla marcar marcha marchar marco marear marea
margen marido marino mariposa marisco mármol marrón martes martillo marzo más
masa mascar máscara mascota masticar matar materia material materiales maternal
matiz matrimonio matriz maullar máximo máxima mayo mayor mayoría mazo me
mecánica mecánico mecer medalla media mediano medianoche mediar medicina médico
medida medidas medio medios medir meditar médula mejilla mejor mejorar mejoría
melodía melón membrana memoria memorizar mencionar menciones menor menos mensaje
mensajes mensual mente mentir mentira menudo mercader mercancía mercado merecer
merendar merienda mérito merma mes mesa meseta mesilla mesón meta metal meterse
método metros mezclar mezcla mi miedo miel miembro mientras miércoles migaja
mil milagro militar milla millar millón mimo mina mineral mínimo mínima ministro
minoría minucioso minuta minuto minutos mío mira mirada mirar misa miserable
miseria misericordia mismo misma mitad mito mixto mochila moda modelo moderno
modesto modificar modificación modo modos mofa mojar molde moler molestar molestia
molino momento moneda monitor mono monstruo montar monte montón moral morar
morado morder moreno morir moro morro mortal mortero mosca mosquito mostrar motivo
motor mover móvil móviles movimiento mozo muchacha muchacho mucho mucha muchos
muchas muda mudanza mudar mudo mueble muela muerte muerto muestra mugre mujer
mula mulato muleta multa múltiplo multitud mundo muñeca muralla murciélago
murmurar muro músculo museo musgo música musical músico muslo mutuo muy
nacer nacimiento nación nacional nada nadar nadie nalgas naranja nariz narrar
natal nativo natural naturaleza náufrago navaja nave navegar navidad navío
neblina necesario necesaria necesidad necio negar negativa negocio negocios negro
negra negrita nervio nervioso neto neutral nevar nevera ni nido niebla nieta
nieto nieve ningún ninguna ninguno niña niño nítido nivel no noble nobleza noche
noción nocturna nocturno nodo nogal nombrar nombre nombres nómina nono norma
normal normalmente normas norte nos nosotros nostalgia nota notar notas noticia
noticias notificar notorio novedad noveno novia novio noviembre nube nublado
nuca nudillo nudo nuera nuestro nuestra nueva nuevo nuevas nuevos nuez
nulo numerada numerado número números nunca nutrir nov
o oasis obedecer obispo objeto objetivo obligación obligar obra obrar obrero obscuro
obsequio observar observación obstáculo obtener ocasión ocultar oculto ocupación
ocupar ocurrir ocurrencia odio oeste ofender ofensa ofrecer oficio oficina
ofrecimiento oído oír ojo ola oler olfato olvidar olvido ombligo omitir onda
onza opaco opción opciones operar operación opinión oponer oportuno oportunidad
oprimir optar optimización optimizar óptimo opuesto oración orador oral orden
ordenar ordinario oreja orfanato orgánico organizar organización órgano
orgullo orientar origen original orilla oro orquesta ortografía osar oscuro
otoño otorgar otro otra otros otras oveja oxígeno oyente operativo operativos
pabellón paciencia paciente padecer padre padres padrino pagar página páginas
pago país paisaje países paja pájaro pala palabra palabras palacio palanca
pálido palma palo paloma palpar pan pana panadero panal pandilla pánico paño
pantalón pantano pantalla pantallas pantera pañuelo papá papel papeles paquete
par para paraguas paraíso parar parcela parcial parecer pared pareja pariente
parque párrafo párrafos parte participar partícula particular partir parto pasar
pasado pasaje pasajero pasaporte pasear paseo pasillo pasión pasivo paso pasos
pasta pastel pastilla pasto pastor pata patada patata patear patente paternal
patín patio pato patria patrón pausa pauta pavo payaso paz peatón pecado pecar
pecho peculio pedal pedir pegar peinar peine pelar peldaño pelear pelea película
peligro peligroso pelo pelota pena penca pendiente pendientes penetrar peninsular
pensamiento pensar pensión penumbra peor pepino pequeño pequeña pequeños
pequeñas pera percibir perder pérdida perdiz perdón perdonar perecer pereza
perfección perfecto perfil perfilar perforar perfume pergamino pericia
periódico periodo perjudicar perjuicio perla permanecer permanente permiso permitir
pero perpetuo perro perseguir perseverar persiana persistir persona personaje
personal personalización personalizar perspectiva persuadir pertenecer pertenencia
perturbar perverso pesa pesado pesar pesca pescar pescuezo pesebre peso pestaña
peste pétalo petición pez piadoso piano picar pico pie piedad piedra piel pierna
pieza pila pilar pillar pimienta pinchar pincel pino pinta pintar pintura pinza
piña piojo pipa pique pirámide pisar piscina piso pista pistola pizarra placa
placer plaga plan plancha planear planeta plano planta plantar plantillas
plantilla plasmar plástico plata plataforma plátano plato playa plaza plazo pleito
pleno pliego plomo pluma plural población poblar pobre pobreza poco poca pocos
pocas podar poder poderoso poema poesía poeta polen policía polilla política
político politécnica pollo polo polvo pólvora pomada poner poniente popular por porcentaje
porción porque portal portar porte portero pórtico poseer posesión posible
posición positivo posponer posterior postura potaje potente potencia pozo
práctica practicar práctico prado precaución preceder precio precioso precipitar
precisar precisión preciso precursor predecesor predecir predilecto predominar
preferencia preferir pregunta preguntar preliminar premio prender prenda prensa
preocupación preocupar preparar preparación presa prescindir presencia presentar
presentación presentaciones presente preservar presidencia presidente presidir
presión presionar prestar préstamo presumir presunto pretender pretexto prevalecer
prevenir prever previo previa previas previos prima primavera primer primera
primero primeros primo primordial princesa principal principalmente principio
principios priorizar prisa prisión privado privar privilegio proa probar problema problemas
proceder procedimiento procesar proceso proclamar procurar prodigio producir
producto producción profesión profesional profesor profesora profeta profundo
programa programar progreso prohibir prólogo prolongar prometer promesa promover
pronto pronunciar propagar propenso propiedad propio propia proponer proporción
proporcional propósito propuesta proscribir proseguir prosperar protagonista
proteger protección protesta protestar protocolo provecho proveer provenir proverbio
provincia provocar próximo próxima próximos proyectar proyecto proyectos prudencia prudente
prueba pruebas pubertad publicación publicar público pública pueblo puente puerco
puerto pues puesto puesta pugna pulgar pulir pulmón pulpo pulsar pulso
pulverizar punta puntada puntería punto puntos punzada puñal puño pupila pupitre
pureza purgar puro púrpura panel
que quebrantar quebrar quedar queja quejar quemar querer querido queso quien
quienes quieto quijada química quince quinientos quinto quinta quitar quizá quizás
rábano rabia racimo racional ración radar radiación radiante radio raíz raja
rajar rallar rama ramo rampa rana rancho rango rápido rápida rápidas rapidez rapiña
raptar raro rascar rasgar rasgo raso raspar rastrillo rastro rata rato ratón
raya rayar rayo raza razón razonar reacción reaccionar real realidad realizar
realmente realeza reanudar rebajar rebaño rebasar rebelar rebelde rebotar rebuznar
recabar recaer recaudo recelo reciente recientes recién recinto recibir recibo
reciclaje recio recipientes recitar reclamar reclamo recobrar recoger
recolección recomendar recompensa reconciliar reconocer reconocible recordar
recorrer recorrido recorte recortar recrear rectángulo recto rectitud rector
recuerdo recuperar recurso recursos red redactar redacción rededor redimir
rediseño redoble redonda redondo reducir reducción reeditar reflejar
reflejo reflexión reflujo reforma reformar reforzar refugio refutar regalar regalo
regañar regar régimen región regional registrar registro regla reglas regresar
regreso regular rehabilitar rehacer rehuir reinar reino reír reja relación
relacionar relajar relámpago relatar relato relevante relieve religión rellenar
reloj relucir remachar remanente remar rematar remediar remedio remitir remo
remojar remolacha remolino remontar remordimiento remover renacer rendir
rendimiento renegar renglón renovar renta renunciar reojo reparar reparación
repartir repasar repaso repente repetir repetición repicar replicar reponer
reportar reportaje reposar reposo represa representar representación reproducir
reptil república repudio repugnar requerir requisito res resbalar rescatar rescate
reseco resentir reserva reservar residir residuo resignar resistir resolver
resonar respaldo respetar respeto respirar resplandor responder respuesta
responsable responsables restablecer restar restaurar resto restos resumir
resumen resurgir retar retención retener retirar retiro reto retocar retornar
retrasar retraso retrato retroceder reunir reunión reuniones revelar revender
reventar revés revestir revisar revisión revista revivir revocar revolver rey
rezar riachuelo ribera rico riqueza ridículo rienda riesgo rifle rígido rigor
rima rimar rincón riña río risa risco ritmo ritual rival rizar
robar robo robot robusto roca rociar rodaja rodar rodear rodilla roer rogar rojo
roja rol rollo romance romano rombo romper roncar ronco ronda rondar ropa rosa
rosca rostro rota rotación roto rótulo rotundo rozar rubí rubio rubor rudeza
rudo rueda ruego rugido rugir ruido ruina ruinoso ruiseñor rumbo rumor rural
ruta rutina resaltado resaltada resaltadas resaltados resultados resultado
sábado sábana saber sabiduría sabio saborear sabor sabroso sacar saciar saco
sacrificio sacrificar sacudir sagrado sal sala salado salario saldar saldo salida
salir saliva salmo salmón salpicar salsa saltar salto salud saludable saludar
saludo salvaje salvar salvo sanar sancionar sandalia sandía sangría sangre sangriento
sano santa santo sapo saqueo sarampión sargento sartén sastre satélite sátira
satisfacer satisfacción satisfecho sauce sauna saxofón sazonar se secar seco
secreto sector secuaz secuencia secuestro secular secundario sede seducir seda
sediento segar seguir según segundo segunda seguro seguridad seis seleccionar
selección sellar sello selva semana semanal semanas semblante sembrar semejante
semejanza semen semilla seminario sencillo sencilla senda sendero seno sensación
sensato sensible sensibilidad sentido sentir señal señalar señor señora señoría
señorita separar separador separación séptimo septiembre sepulcro sepultar sequía
ser sereno serie seriedad serio sermón serpiente servicio servidor servir sesión
sesiones seso seta setenta seto severo sexo sexto si sí siembra siempre sien siento
siervo sierra siesta siete siglo significado significar siguiente siguientes
sílaba silbar silbato silencio silencioso silla sillón silvestre símbolo símbolos
simetría similar simpatía simple simplemente simplificar simular simultáneo sin
sincero sindicato sinfonía singular sino síntesis síntoma sinuoso sismo sistema
sistemas sitio situación situar sobar soberano soberbia soborno sobra sobrar sobre
sobrepasar sobresalir sobrina sobrino socavar social sociedad socio socorrer
socorro sofá soga sol solamente solar soldado soldar soledad solemne soler
solicitar solicitud sólido solitario solo sola soltar soltera soltero solución
solucionar solvente sombra sombrero someter somnolencia sonar sondeo sonido
sonoro sonreír sonrisa soñar sopapo sopesar soplar soplo soportar soporte
sorber sorbo sordo sorprender sorpresa sortear sorteo sosegar sospecha sospechar
sostener sótano suave suavidad subasta subir súbito sublevar sublime subrayado
subrayar suscribir subsecuente subsidio subsistir substancia sustituir substraer
subterráneo subtítulo subtítulos subvencionar succionar suceder suceso sucesivo
suciedad sucio sucursal sudar sudor suegra suegro suela sueldo suelo sueño
suero suerte suficiente sufrir sufrimiento sugerencia sugerir suicidio sujetar
sujeto suma sumar sumario sumergir suministrar sumo sumiso sumisión súper
superar superficie superficial superfluo superior superiores supermercado súplica
suplicar suponer suprimir supuesto supuesta sur surcar surgir surtir suscitar
suspender suspensión suspirar sustantivo sustento sustituir susto sustraer
susurrar sutil suyo suya suite
tabaco taberna tabique tabla tablas tablero tableta taburete tacaño tachado
tachar táctica táctil táctiles tacto tajo tal taladro talante talento talla tallar
talle taller tallo talón tamaño también tambor tampoco tan tanda tangente tanque
tanto tanta tantos tantas tapa tapar tapete tapiz tapizar tapón taquilla tardanza
tardar tarde tarea tarifa tarjeta tarro tarta tartamudo tasa tasar tasca
tauro taza tazón te teatro techo tecla teclado técnica técnico técnicos tecnología
tedio teja tejer tejido tela telar teléfono telegrama telón tema temático
temática temblar temblor temer temerario temeroso temor temperamento temperatura
tempestad temple templo temprano tenaz tenaza tender tendedero tendencia
tendero tenedor tener tenis tenor tensión tentación tentar tenue teología
teoría tercer tercera tercero tercio terco terminar término términos termómetro
ternero ternura terraza terremoto terreno terrible terror terso tesis tesoro
testamento testigo testimoniar testimonio teta texto textos tez tía tibio tiburón
tiempo tiempos tienda tierno tierra tieso tiesto tigre tijera tilde timbre tímido
timón tina tiniebla tinta tinte tintero tintura tío típico típica tipo tipos
tipografía tipográfica tira tirar tiritar tiro tirón título títulos tiza toalla
tobillo tocar tocino todavía todo toda todos todas togado toldo tolerancia tolerar
toma tomar tomate tomo tonel tonelada tono tonos tontería tonto topacio topar
tope topo toque torbellino torcer tordo toreo torero tormenta tormento tornar
torneo torno toro torpe torpeza torre torrente torta tortuga tortura tos toser
tostada tostar total totalidad totalmente trabajador trabajar trabajo trabajos
trabar tradición tradicional traducir traducción traer tráfico tragar tragedia
trágico trago traición traidor traje trama tramar trámite tramo trampa tranca
trance tranquilo tranquilizar tranquilidad transacción transcurrir transferir
transformar tránsito transitar transitorio transmitir transparente transportar
transporte tranvía trapo tráquea tras trascender trasero trasladar traspasar
traste trastorno tratar tratado tratamiento trato través travesía travieso trazar
trazo trébol trece tregua treinta tremendo tren trenza trepar tres tribu tribunal
tributo trigo trillar trimestre trimestral trinar trinchera trinidad trino tripa
triple tripulación triste tristeza triunfo triunfar trivial triza trocar trofeo
trompa trompeta tronco trono tropa tropezar tropiezo trotar trozo trucha truco
trueno trueque tú tubería tubo tuerca tuerto tulipán tumba tumbar tumor tumulto
tuna túnel túnica tupido turba turbar turbina turbio turismo turista turno
turrón tutela tutor tuyo tuya
u ubicar ubicación ubre ufano último última últimos últimas ultrajar ultra
umbral un una unas uno unos ungir único única únicos únicas únicamente unidad unidades
unificar uniforme unión unir universo universal universidad universitario untar
uña urbe urgencia urgente urna usar uso usual usuario usuarios usurpar utensilio
útil utilidad utilizar uva
vaca vacación vacaciones vaciar vacilar vacío vacía vacuna vacunar vagar
vago vaguedad vaina vajilla valer valía validar validación válido válida valiente
valor valorar valores vals válvula valla valle vamos vampiro vanidad vano
vapor vaquero vara varar variable variación variar variedad vario varios varita
varón vasija vaso vástago vasto vate vaticinar vaya vecindad vecino vecina
vector veda vedar vega vegetación vegetal vehemencia vehículo veinte vejez
vejiga vela velar veleidad velero veloz velocidad vello velo vena venado vencer
vencedor venda vendar vender vendimia veneno venerar venganza vengar venia
venir venta ventaja ventana ventilar ventisca ventura ver verano veras verdad
verdadero verde verdura vereda vergüenza verificar verificación verja verso
verter vertical vértice vertiginoso vesícula vespertino vestigio vestido vestir
vestuario veta veterano vetusto vez viabilidad viable viajar viaje viajero
vianda víbora vibrar vicio vicisitud víctima victoria vid vida vídeo vidriera
vidrio viejo vieja viento vientre viernes viga vigilar vigilancia vigilia vigor
vil villa villano vinagre vincular vínculo vindicar vino viña violación violar
violencia violento violeta violín virgen viril virtual virtud virtuoso virus
visa visado visera visible visión visitar visita visor visores víspera vista
vistazo visto visual visualización visualizar vital vitalidad vitamina vitrina
viuda viudo vivacidad vivaz vivero viveza vivienda vivir vivo vizconde vocablo
vocabulario vocación vocal vocero volar volcán volcar volea voluntad volver
vomitar voraz vos vosotros votar voto voz vuelo vuelta vuelto vuestro vuestra
vulgar vulgo vulnerar
y yacer yate yegua yema yerno yerro yeso yo yodo yoga yugo yunque yunta
zafiro zaga zaguero zambullir zanahoria zanja zapatero zapatilla zapato zarpar
zarza cebra zepelín zigzag zinc zócalo zona zonas zoquete zorra zorro zozobra
zumbar zumbido zumo zurcir zurdo
actualización automático ocular jerarquía encabezado sección viñetas reemplazar
contador integrar integrado anotación anotaciones importación almacenamiento
disponibilidad métrica actual actualidad creado versión arquitectura historial
`;

const TECH_AND_BRAND_WORDS = [
  'alx',
  'wps',
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'txt',
  'html',
  'htm',
  'css',
  'js',
  'ts',
  'tsx',
  'json',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'google',
  'drive',
  'picker',
  'android',
  'ios',
  'safari',
  'chrome',
  'pwa',
  'offline',
  'online',
  'frontend',
  'backend',
  'app',
  'apps',
  'ux',
  'ui',
  'qa',
  'viewport',
  'arraybuffer',
  'utf',
  'latin',
  'writer',
  'office',
  'word',
  'powerpoint',
  'excel',
  'ole2',
  'smartart',
  'sepia',
  'sans',
  'serif',
  'mono',
  'sofía',
  'sofia',
  'navarro',
  'ruiz',
  'laura',
  'méndez',
  'carlos',
  'vega',
  'ana',
  'morales',
  'elena',
  'marcos',
  'lucía',
  'javier',
  'madrid',
  'zoom',
  'a4',
  'q1',
  'q2',
  'q3',
  'q4',
  'px',
  'mb',
  'kb',
  'gb',
  'min',
  'nov',
  'multi',
  'multiplataforma',
  'h1',
  'h2',
  'h3',
];

function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Build dictionary Set once on module load
const DICTIONARY: Set<string> = (() => {
  const set = new Set<string>();
  const rawTokens = CORE_WORDS_RAW.split(/\s+/);
  for (const token of rawTokens) {
    const clean = token.trim().toLowerCase();
    if (!clean) continue;
    set.add(clean);
  }
  for (const tech of TECH_AND_BRAND_WORDS) {
    set.add(tech.toLowerCase());
  }

  // Controlled plural/gender & regular verb form generation from core words
  const baseWords = Array.from(set);
  for (const w of baseWords) {
    if (w.length < 3) continue;

    // Regular plurals
    if (/[aeiouáéíóú]$/.test(w)) {
      if (!w.endsWith('s')) set.add(`${w}s`);
    } else if (/[lnrdsj]$/.test(w)) {
      set.add(`${w}es`);
    } else if (w.endsWith('z')) {
      set.add(`${w.slice(0, -1)}ces`);
    }

    // Adjectives/nouns ending in -o -> -a / -os / -as
    if (w.endsWith('o') && w.length >= 4) {
      const stem = w.slice(0, -1);
      set.add(`${stem}a`);
      set.add(`${stem}os`);
      set.add(`${stem}as`);
    }

    // Adverbs from -a or consonant-ending adjectives
    if ((w.endsWith('a') || w.endsWith('e') || w.endsWith('l') || w.endsWith('r')) && w.length >= 4) {
      if (!w.endsWith('mente')) {
        set.add(`${w}mente`);
      }
    }

    // Regular -ar verbs
    if (w.endsWith('ar') && w.length >= 4) {
      const stem = w.slice(0, -2);
      const suffixes = [
        'o', 'as', 'a', 'amos', 'an',
        'e', 'es', 'emos', 'en',
        'aba', 'abas', 'abamos', 'aban',
        'are', 'aras', 'ara', 'aremos', 'aran',
        'aria', 'arias', 'ariamos', 'arian',
        'ando', 'ado', 'ada', 'ados', 'adas',
        'ó', 'é', 'aron', 'aste',
      ];
      for (const s of suffixes) set.add(`${stem}${s}`);
    }

    // Regular -er verbs
    if (w.endsWith('er') && w.length >= 4) {
      const stem = w.slice(0, -2);
      const suffixes = [
        'o', 'es', 'e', 'emos', 'en',
        'ia', 'ias', 'iamos', 'ian',
        'iendo', 'ido', 'ida', 'idos', 'idas',
        'ieron', 'ió', 'í',
      ];
      for (const s of suffixes) set.add(`${stem}${s}`);
    }

    // Regular -ir verbs
    if (w.endsWith('ir') && w.length >= 4) {
      const stem = w.slice(0, -2);
      const suffixes = [
        'o', 'es', 'e', 'imos', 'en',
        'ia', 'ias', 'iamos', 'ian',
        'iendo', 'ido', 'ida', 'idos', 'idas',
        'ieron', 'ió', 'í',
      ];
      for (const s of suffixes) set.add(`${stem}${s}`);
    }
  }

  return set;
})();

const DICTIONARY_LIST = Array.from(DICTIONARY);
const DICTIONARY_BY_LEN = new Map<number, string[]>();
for (const w of DICTIONARY_LIST) {
  const len = w.length;
  let arr = DICTIONARY_BY_LEN.get(len);
  if (!arr) {
    arr = [];
    DICTIONARY_BY_LEN.set(len, arr);
  }
  arr.push(w);
}

export function loadCustomDictionary(): Set<string> {
  try {
    const raw = localStorage.getItem(CUSTOM_DICT_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map((w) => String(w).trim().toLowerCase()).filter(Boolean));
    }
  } catch {
    // Ignore storage errors
  }
  return new Set();
}

export function saveCustomDictionary(words: Set<string>): void {
  try {
    localStorage.setItem(CUSTOM_DICT_STORAGE_KEY, JSON.stringify(Array.from(words)));
  } catch {
    // Ignore storage errors
  }
}

export function isWordValid(
  rawWord: string,
  ignoredWords: Set<string>,
  customWords: Set<string>,
): boolean {
  const clean = rawWord.trim();
  if (clean.length <= 1) return true;

  // Ignore numbers, dimensions (e.g. 44px, 18%), hex, roman numerals or short uppercase acronyms
  if (/^\d+([.,]\d+)?(px|pt|em|rem|%|x|m|s|h|min|kb|mb|gb)?$/i.test(clean)) {
    return true;
  }
  if (/^[A-ZÁÉÍÓÚÑ0-9]{2,5}$/.test(clean)) {
    return true;
  }

  const lower = clean.toLowerCase();
  if (ignoredWords.has(lower) || customWords.has(lower)) {
    return true;
  }

  if (DICTIONARY.has(lower)) {
    return true;
  }

  // Accept capitalized proper names not in dictionary only? Wait: no, users type capitalized sentences!
  // Accept words attached to common Spanish enclitic pronouns if base verb exists
  const encliticMatch = lower.match(/^(.{3,})(me|te|se|lo|la|los|las|le|les|nos)$/);
  if (encliticMatch) {
    const base = stripAccents(encliticMatch[1]);
    if (DICTIONARY.has(encliticMatch[1]) || DICTIONARY.has(base)) {
      return true;
    }
  }

  return false;
}

const suggestionCache = new Map<string, string[]>();

function damerauLevenshteinWeighted(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const ca = a[i - 1];
      const cb = b[j - 1];
      let subCost = 1;
      if (ca === cb) {
        subCost = 0;
      } else if (stripAccents(ca) === stripAccents(cb)) {
        subCost = 0.2;
      } else if (
        (ca === 'b' && cb === 'v') || (ca === 'v' && cb === 'b') ||
        (ca === 'c' && (cb === 's' || cb === 'z')) ||
        (ca === 's' && (cb === 'c' || cb === 'z')) ||
        (ca === 'z' && (cb === 'c' || cb === 's')) ||
        (ca === 'g' && cb === 'j') || (ca === 'j' && cb === 'g') ||
        (ca === 'y' && cb === 'i') || (ca === 'i' && cb === 'y') ||
        (ca === 'k' && cb === 'q') || (ca === 'q' && cb === 'k')
      ) {
        subCost = 0.45;
      }

      let best = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + subCost,
      );

      if (i > 1 && j > 1 && ca === b[j - 2] && a[i - 2] === cb) {
        best = Math.min(best, dp[i - 2][j - 2] + 0.75);
      }

      dp[i][j] = best;
    }
  }

  return dp[m][n];
}

function matchCasing(template: string, candidate: string): string {
  if (!template) return candidate;
  if (template === template.toUpperCase() && template !== template.toLowerCase()) {
    return candidate.toUpperCase();
  }
  if (
    template[0] === template[0].toUpperCase() &&
    template[0] !== template[0].toLowerCase()
  ) {
    return candidate.charAt(0).toUpperCase() + candidate.slice(1);
  }
  return candidate;
}

export function getSpellingSuggestions(rawWord: string, maxResults = 5): string[] {
  const lower = rawWord.trim().toLowerCase();
  if (!lower) return [];

  let baseList = suggestionCache.get(lower);
  if (!baseList) {
    const len = lower.length;
    const minLen = Math.max(2, len - 2);
    const maxLen = len + 2;
    const strippedLower = stripAccents(lower);
    const maxAllowedCost = len <= 4 ? 1.8 : len <= 7 ? 2.4 : 3.0;

    const scored: { word: string; score: number }[] = [];

    for (let l = minLen; l <= maxLen; l++) {
      const bucket = DICTIONARY_BY_LEN.get(l);
      if (!bucket) continue;
      for (const cand of bucket) {
        // Quick first-character or second-character filter for long dictionaries
        if (
          len >= 5 &&
          stripAccents(cand[0]) !== strippedLower[0] &&
          stripAccents(cand[1] ?? '') !== strippedLower[1] &&
          stripAccents(cand[0]) !== strippedLower[1]
        ) {
          continue;
        }
        const dist = damerauLevenshteinWeighted(lower, cand);
        if (dist <= maxAllowedCost) {
          let bonus = 0;
          if (stripAccents(cand) === strippedLower) bonus -= 0.5;
          if (cand[0] === lower[0]) bonus -= 0.1;
          scored.push({ word: cand, score: dist + bonus });
        }
      }
    }

    scored.sort((a, b) => a.score - b.score || a.word.length - b.word.length);

    const unique: string[] = [];
    const seen = new Set<string>();
    for (const item of scored) {
      if (item.word === lower || seen.has(item.word)) continue;
      seen.add(item.word);
      unique.push(item.word);
      if (unique.length >= 8) break;
    }

    baseList = unique;
    suggestionCache.set(lower, baseList);
  }

  return baseList.slice(0, maxResults).map((w) => matchCasing(rawWord, w));
}

const TOKEN_REGEX = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+/g;

function isInsideSkipTag(node: Node): boolean {
  let curr: Node | null = node.parentNode;
  while (curr && curr.nodeType === Node.ELEMENT_NODE) {
    const tag = (curr as Element).tagName;
    if (tag === 'CODE' || tag === 'PRE' || tag === 'SCRIPT' || tag === 'STYLE') {
      return true;
    }
    curr = curr.parentNode;
  }
  return false;
}

function isPartOfUrlOrEmail(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 48), start);
  const after = text.slice(end, Math.min(text.length, end + 24));
  if (/https?:\/\/\S*$/i.test(before) || /@[A-Za-z0-9.-]*$/.test(before)) return true;
  if (/^@\S+/.test(after) || /^\.(com|org|net|es|io|dev|pdf|doc|docx|ppt|pptx|txt)\b/i.test(after)) {
    return true;
  }
  return false;
}

export function scanElementSpelling(
  root: HTMLElement,
  ignoredWords: Set<string>,
  customWords: Set<string>,
): SpellErrorMatch[] {
  const matches: SpellErrorMatch[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let counter = 0;

  while (node) {
    const textNode = node as Text;
    const text = textNode.nodeValue || '';
    if (text.trim().length > 0 && !isInsideSkipTag(textNode)) {
      TOKEN_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = TOKEN_REGEX.exec(text)) !== null) {
        const word = match[0];
        const start = match.index;
        const end = start + word.length;

        if (isPartOfUrlOrEmail(text, start, end)) continue;

        if (!isWordValid(word, ignoredWords, customWords)) {
          const range = document.createRange();
          range.setStart(textNode, start);
          range.setEnd(textNode, end);
          matches.push({
            id: `err-${counter++}-${start}`,
            word,
            normalized: word.toLowerCase(),
            range,
          });
        }
      }
    }
    node = walker.nextNode();
  }

  return matches;
}
