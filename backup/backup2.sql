--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

-- Started on 2025-12-11 23:33:39

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 990 (class 1247 OID 33690)
-- Name: estado_solicitud_enum; Type: TYPE; Schema: public; Owner: ferram
--

CREATE TYPE public.estado_solicitud_enum AS ENUM (
    'PENDIENTE',
    'APROBADO',
    'RECHAZADO'
);


ALTER TYPE public.estado_solicitud_enum OWNER TO ferram;

--
-- TOC entry 987 (class 1247 OID 33682)
-- Name: tipo_cambio_enum; Type: TYPE; Schema: public; Owner: ferram
--

CREATE TYPE public.tipo_cambio_enum AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE'
);


ALTER TYPE public.tipo_cambio_enum OWNER TO ferram;

--
-- TOC entry 274 (class 1255 OID 25532)
-- Name: limitar_notificaciones_por_cliente(); Type: FUNCTION; Schema: public; Owner: ferram
--

CREATE FUNCTION public.limitar_notificaciones_por_cliente() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Lógica corregida:
  -- Borrar todas las notificaciones de este cliente QUE NO ESTÉN
  -- dentro de las 100 más recientes.
  DELETE FROM notificaciones
  WHERE clienteid = NEW.clienteid
  AND notificacionid NOT IN (
    SELECT notificacionid
    FROM notificaciones
    WHERE clienteid = NEW.clienteid
    ORDER BY fechacreacion DESC
    LIMIT 100
  );
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.limitar_notificaciones_por_cliente() OWNER TO ferram;

--
-- TOC entry 273 (class 1255 OID 25531)
-- Name: limpiar_notificaciones_antiguas(); Type: FUNCTION; Schema: public; Owner: ferram
--

CREATE FUNCTION public.limpiar_notificaciones_antiguas() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  eliminadas INTEGER;
BEGIN
  DELETE FROM notificaciones
  WHERE leida = TRUE 
  AND fechacreacion < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS eliminadas = ROW_COUNT;
  RETURN eliminadas;
END;
$$;


ALTER FUNCTION public.limpiar_notificaciones_antiguas() OWNER TO ferram;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 242 (class 1259 OID 17400)
-- Name: administradores; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.administradores (
    adminid integer NOT NULL,
    nombre character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    passwordhash character varying(255) NOT NULL,
    rol character varying(50) DEFAULT 'admin'::character varying NOT NULL,
    activo boolean DEFAULT true,
    fechacreacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    apellido character(100)
);


ALTER TABLE public.administradores OWNER TO ferram;

--
-- TOC entry 241 (class 1259 OID 17399)
-- Name: administradores_adminid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.administradores_adminid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.administradores_adminid_seq OWNER TO ferram;

--
-- TOC entry 5315 (class 0 OID 0)
-- Dependencies: 241
-- Name: administradores_adminid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.administradores_adminid_seq OWNED BY public.administradores.adminid;


--
-- TOC entry 220 (class 1259 OID 17222)
-- Name: agentesdeventas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agentesdeventas (
    agenteid integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    passwordhash character varying(255) NOT NULL,
    codigoagente character varying(50) NOT NULL,
    activo boolean DEFAULT true,
    esadmin boolean DEFAULT false NOT NULL,
    adminrol text
);


ALTER TABLE public.agentesdeventas OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 17221)
-- Name: agentesdeventas_agenteid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.agentesdeventas_agenteid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.agentesdeventas_agenteid_seq OWNER TO postgres;

--
-- TOC entry 5316 (class 0 OID 0)
-- Dependencies: 219
-- Name: agentesdeventas_agenteid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.agentesdeventas_agenteid_seq OWNED BY public.agentesdeventas.agenteid;


--
-- TOC entry 228 (class 1259 OID 17282)
-- Name: carritodecompra; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.carritodecompra (
    carritoid integer NOT NULL,
    clienteid integer NOT NULL,
    fechacreacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    ultimamodificacion timestamp without time zone
);


ALTER TABLE public.carritodecompra OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 17281)
-- Name: carritodecompra_carritoid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.carritodecompra_carritoid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.carritodecompra_carritoid_seq OWNER TO postgres;

--
-- TOC entry 5317 (class 0 OID 0)
-- Dependencies: 227
-- Name: carritodecompra_carritoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.carritodecompra_carritoid_seq OWNED BY public.carritodecompra.carritoid;


--
-- TOC entry 264 (class 1259 OID 25440)
-- Name: cat_tamanopaquetes; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.cat_tamanopaquetes (
    tamanoid integer NOT NULL,
    cantidad integer NOT NULL
);


ALTER TABLE public.cat_tamanopaquetes OWNER TO ferram;

--
-- TOC entry 263 (class 1259 OID 25439)
-- Name: cat_tamanopaquetes_tamanoid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.cat_tamanopaquetes_tamanoid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cat_tamanopaquetes_tamanoid_seq OWNER TO ferram;

--
-- TOC entry 5318 (class 0 OID 0)
-- Dependencies: 263
-- Name: cat_tamanopaquetes_tamanoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.cat_tamanopaquetes_tamanoid_seq OWNED BY public.cat_tamanopaquetes.tamanoid;


--
-- TOC entry 222 (class 1259 OID 17236)
-- Name: categorias; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categorias (
    categoriaid integer NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion text,
    parentcategoriaid integer,
    activo boolean DEFAULT true
);


ALTER TABLE public.categorias OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 17235)
-- Name: categorias_categoriaid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.categorias_categoriaid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.categorias_categoriaid_seq OWNER TO postgres;

--
-- TOC entry 5319 (class 0 OID 0)
-- Dependencies: 221
-- Name: categorias_categoriaid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.categorias_categoriaid_seq OWNED BY public.categorias.categoriaid;


--
-- TOC entry 232 (class 1259 OID 17312)
-- Name: cliente_direcciones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cliente_direcciones (
    direccionid integer NOT NULL,
    clienteid integer NOT NULL,
    etiqueta character varying(100),
    receptor character varying(255) NOT NULL,
    calle character varying(255) NOT NULL,
    numeroext character varying(50),
    numeroint character varying(50),
    colonia character varying(150),
    ciudad character varying(100) NOT NULL,
    codigopostal character varying(10) NOT NULL,
    telefonocontacto character varying(20),
    estadoid integer NOT NULL
);


ALTER TABLE public.cliente_direcciones OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 17311)
-- Name: cliente_direcciones_direccionid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cliente_direcciones_direccionid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cliente_direcciones_direccionid_seq OWNER TO postgres;

--
-- TOC entry 5320 (class 0 OID 0)
-- Dependencies: 231
-- Name: cliente_direcciones_direccionid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cliente_direcciones_direccionid_seq OWNED BY public.cliente_direcciones.direccionid;


--
-- TOC entry 218 (class 1259 OID 17210)
-- Name: clientes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clientes (
    clienteid integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    passwordhash character varying(255),
    telefono character varying(20),
    fechaderegistro timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    activo boolean DEFAULT true NOT NULL,
    agenteid integer,
    google_id character varying(255),
    avatar_url text
);


ALTER TABLE public.clientes OWNER TO postgres;

--
-- TOC entry 217 (class 1259 OID 17209)
-- Name: clientes_clienteid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.clientes_clienteid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clientes_clienteid_seq OWNER TO postgres;

--
-- TOC entry 5321 (class 0 OID 0)
-- Dependencies: 217
-- Name: clientes_clienteid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.clientes_clienteid_seq OWNED BY public.clientes.clienteid;


--
-- TOC entry 238 (class 1259 OID 17367)
-- Name: comisiones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.comisiones (
    comisionid integer NOT NULL,
    pedidoid integer NOT NULL,
    agenteid integer NOT NULL,
    montocomision numeric(10,2) NOT NULL,
    fechacalculo timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    estatus character varying(50) DEFAULT 'Pendiente'::character varying NOT NULL
);


ALTER TABLE public.comisiones OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 17366)
-- Name: comisiones_comisionid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.comisiones_comisionid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.comisiones_comisionid_seq OWNER TO postgres;

--
-- TOC entry 5322 (class 0 OID 0)
-- Dependencies: 237
-- Name: comisiones_comisionid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.comisiones_comisionid_seq OWNED BY public.comisiones.comisionid;


--
-- TOC entry 256 (class 1259 OID 17551)
-- Name: communicationlogs; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.communicationlogs (
    logid integer NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    destinatario character varying(255) NOT NULL,
    asunto character varying(255) NOT NULL,
    estatusemail character varying(20) NOT NULL,
    errormensaje text,
    pedidoid integer,
    clienteid integer,
    proveedorid integer,
    CONSTRAINT communicationlogs_estatusemail_check CHECK (((estatusemail)::text = ANY ((ARRAY['Enviado'::character varying, 'Fallido'::character varying])::text[])))
);


ALTER TABLE public.communicationlogs OWNER TO ferram;

--
-- TOC entry 255 (class 1259 OID 17550)
-- Name: communicationlogs_logid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.communicationlogs_logid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.communicationlogs_logid_seq OWNER TO ferram;

--
-- TOC entry 5323 (class 0 OID 0)
-- Dependencies: 255
-- Name: communicationlogs_logid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.communicationlogs_logid_seq OWNED BY public.communicationlogs.logid;


--
-- TOC entry 272 (class 1259 OID 33698)
-- Name: control_cambios; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.control_cambios (
    id integer NOT NULL,
    entidad character varying(100) NOT NULL,
    entidad_id integer,
    tipo_cambio public.tipo_cambio_enum NOT NULL,
    datos_anteriores jsonb,
    datos_nuevos jsonb,
    usuario_solicitante_id integer NOT NULL,
    estado public.estado_solicitud_enum DEFAULT 'PENDIENTE'::public.estado_solicitud_enum NOT NULL,
    fecha_solicitud timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_resolucion timestamp without time zone,
    usuario_resolutor_id integer
);


ALTER TABLE public.control_cambios OWNER TO ferram;

--
-- TOC entry 271 (class 1259 OID 33697)
-- Name: control_cambios_id_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.control_cambios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.control_cambios_id_seq OWNER TO ferram;

--
-- TOC entry 5324 (class 0 OID 0)
-- Dependencies: 271
-- Name: control_cambios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.control_cambios_id_seq OWNED BY public.control_cambios.id;


--
-- TOC entry 236 (class 1259 OID 17350)
-- Name: detallesdelpedido; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.detallesdelpedido (
    detalleid integer NOT NULL,
    pedidoid integer NOT NULL,
    varianteid integer NOT NULL,
    cantidadpaquetes integer NOT NULL,
    precioporpaquete numeric(10,2) NOT NULL,
    piezastotales integer NOT NULL,
    preciounitario numeric(10,2),
    tamanoid integer,
    esbackorder boolean DEFAULT false,
    cantidadsurtida integer DEFAULT 0,
    cantidadbackorder integer DEFAULT 0
);


ALTER TABLE public.detallesdelpedido OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 17349)
-- Name: detallesdelpedido_detalleid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.detallesdelpedido_detalleid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.detallesdelpedido_detalleid_seq OWNER TO postgres;

--
-- TOC entry 5325 (class 0 OID 0)
-- Dependencies: 235
-- Name: detallesdelpedido_detalleid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.detallesdelpedido_detalleid_seq OWNED BY public.detallesdelpedido.detalleid;


--
-- TOC entry 248 (class 1259 OID 17437)
-- Name: detallesordencompra; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.detallesordencompra (
    detalleoc_id integer NOT NULL,
    ordencompraid integer NOT NULL,
    varianteid integer NOT NULL,
    cantidadsolicitada integer NOT NULL,
    cantidadrecibida integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.detallesordencompra OWNER TO ferram;

--
-- TOC entry 247 (class 1259 OID 17436)
-- Name: detallesordencompra_detalleoc_id_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.detallesordencompra_detalleoc_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.detallesordencompra_detalleoc_id_seq OWNER TO ferram;

--
-- TOC entry 5326 (class 0 OID 0)
-- Dependencies: 247
-- Name: detallesordencompra_detalleoc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.detallesordencompra_detalleoc_id_seq OWNED BY public.detallesordencompra.detalleoc_id;


--
-- TOC entry 267 (class 1259 OID 25508)
-- Name: notificaciones; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.notificaciones (
    notificacionid integer NOT NULL,
    clienteid integer NOT NULL,
    tipo character varying(50) NOT NULL,
    titulo character varying(200) NOT NULL,
    mensaje text NOT NULL,
    leida boolean DEFAULT false,
    fechacreacion timestamp without time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    url character varying(500),
    prioridad character varying(20) DEFAULT 'normal'::character varying,
    CONSTRAINT notificaciones_prioridad_check CHECK (((prioridad)::text = ANY ((ARRAY['baja'::character varying, 'normal'::character varying, 'alta'::character varying, 'urgente'::character varying])::text[]))),
    CONSTRAINT notificaciones_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['pedido'::character varying, 'oferta'::character varying, 'temporada'::character varying, 'backorder'::character varying, 'sistema'::character varying, 'producto'::character varying])::text[])))
);


ALTER TABLE public.notificaciones OWNER TO ferram;

--
-- TOC entry 5327 (class 0 OID 0)
-- Dependencies: 267
-- Name: TABLE notificaciones; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.notificaciones IS 'Notificaciones para clientes del sistema';


--
-- TOC entry 5328 (class 0 OID 0)
-- Dependencies: 267
-- Name: COLUMN notificaciones.tipo; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.notificaciones.tipo IS 'Tipo de notificación: pedido, oferta, temporada, backorder, sistema, producto';


--
-- TOC entry 5329 (class 0 OID 0)
-- Dependencies: 267
-- Name: COLUMN notificaciones.metadata; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.notificaciones.metadata IS 'Información adicional en formato JSON (ej: pedidoId, productoId, etc)';


--
-- TOC entry 5330 (class 0 OID 0)
-- Dependencies: 267
-- Name: COLUMN notificaciones.url; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.notificaciones.url IS 'URL de redirección al hacer click en la notificación';


--
-- TOC entry 5331 (class 0 OID 0)
-- Dependencies: 267
-- Name: COLUMN notificaciones.prioridad; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.notificaciones.prioridad IS 'Prioridad de la notificación: baja, normal, alta, urgente';


--
-- TOC entry 268 (class 1259 OID 25534)
-- Name: estadisticas_notificaciones; Type: VIEW; Schema: public; Owner: ferram
--

CREATE VIEW public.estadisticas_notificaciones AS
 SELECT c.clienteid,
    c.nombre,
    count(*) AS total_notificaciones,
    count(*) FILTER (WHERE (n.leida = false)) AS no_leidas,
    count(*) FILTER (WHERE ((n.tipo)::text = 'pedido'::text)) AS notif_pedidos,
    count(*) FILTER (WHERE ((n.tipo)::text = 'oferta'::text)) AS notif_ofertas,
    count(*) FILTER (WHERE ((n.tipo)::text = 'temporada'::text)) AS notif_temporadas,
    max(n.fechacreacion) AS ultima_notificacion
   FROM (public.clientes c
     LEFT JOIN public.notificaciones n ON ((c.clienteid = n.clienteid)))
  GROUP BY c.clienteid, c.nombre;


ALTER VIEW public.estadisticas_notificaciones OWNER TO ferram;

--
-- TOC entry 5332 (class 0 OID 0)
-- Dependencies: 268
-- Name: VIEW estadisticas_notificaciones; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON VIEW public.estadisticas_notificaciones IS 'Estadísticas de notificaciones por cliente';


--
-- TOC entry 260 (class 1259 OID 25400)
-- Name: estados; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.estados (
    estadoid integer NOT NULL,
    nombre character varying(100) NOT NULL,
    abreviatura character varying(10) NOT NULL
);


ALTER TABLE public.estados OWNER TO ferram;

--
-- TOC entry 259 (class 1259 OID 25399)
-- Name: estados_estadoid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.estados_estadoid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.estados_estadoid_seq OWNER TO ferram;

--
-- TOC entry 5333 (class 0 OID 0)
-- Dependencies: 259
-- Name: estados_estadoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.estados_estadoid_seq OWNED BY public.estados.estadoid;


--
-- TOC entry 230 (class 1259 OID 17295)
-- Name: itemsdelcarrito; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.itemsdelcarrito (
    itemid integer NOT NULL,
    carritoid integer NOT NULL,
    varianteid integer NOT NULL,
    cantidadpaquetes integer NOT NULL,
    tamanoid integer,
    cantidad integer
);


ALTER TABLE public.itemsdelcarrito OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 17294)
-- Name: itemsdelcarrito_itemid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.itemsdelcarrito_itemid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.itemsdelcarrito_itemid_seq OWNER TO postgres;

--
-- TOC entry 5334 (class 0 OID 0)
-- Dependencies: 229
-- Name: itemsdelcarrito_itemid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.itemsdelcarrito_itemid_seq OWNED BY public.itemsdelcarrito.itemid;


--
-- TOC entry 262 (class 1259 OID 25416)
-- Name: log_eventosusuario; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.log_eventosusuario (
    eventoid integer NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    clienteid integer,
    sessionid character varying(255),
    tipoevento character varying(50) NOT NULL,
    varianteid integer,
    contextojson jsonb
);


ALTER TABLE public.log_eventosusuario OWNER TO ferram;

--
-- TOC entry 261 (class 1259 OID 25415)
-- Name: log_eventosusuario_eventoid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.log_eventosusuario_eventoid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.log_eventosusuario_eventoid_seq OWNER TO ferram;

--
-- TOC entry 5335 (class 0 OID 0)
-- Dependencies: 261
-- Name: log_eventosusuario_eventoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.log_eventosusuario_eventoid_seq OWNED BY public.log_eventosusuario.eventoid;


--
-- TOC entry 240 (class 1259 OID 17386)
-- Name: log_inventario; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.log_inventario (
    logid integer NOT NULL,
    varianteid integer NOT NULL,
    fecha timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    cantidadcambiado integer NOT NULL,
    nuevostock integer NOT NULL,
    motivo character varying(255),
    usuarioid integer
);


ALTER TABLE public.log_inventario OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 17385)
-- Name: log_inventario_logid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.log_inventario_logid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.log_inventario_logid_seq OWNER TO postgres;

--
-- TOC entry 5336 (class 0 OID 0)
-- Dependencies: 239
-- Name: log_inventario_logid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.log_inventario_logid_seq OWNED BY public.log_inventario.logid;


--
-- TOC entry 270 (class 1259 OID 25542)
-- Name: log_movimientos; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.log_movimientos (
    logid integer NOT NULL,
    usuarioid integer,
    nombreusuario character varying(150) NOT NULL,
    rol character varying(50),
    accion character varying(50) NOT NULL,
    entidad character varying(100) NOT NULL,
    entidadid integer,
    detalles jsonb,
    ip character varying(45),
    fecha timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT log_movimientos_accion_check CHECK (((accion)::text = ANY ((ARRAY['CREAR'::character varying, 'EDITAR'::character varying, 'ELIMINAR'::character varying, 'LOGIN'::character varying, 'OTRO'::character varying])::text[])))
);


ALTER TABLE public.log_movimientos OWNER TO ferram;

--
-- TOC entry 269 (class 1259 OID 25541)
-- Name: log_movimientos_logid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.log_movimientos_logid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.log_movimientos_logid_seq OWNER TO ferram;

--
-- TOC entry 5337 (class 0 OID 0)
-- Dependencies: 269
-- Name: log_movimientos_logid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.log_movimientos_logid_seq OWNED BY public.log_movimientos.logid;


--
-- TOC entry 252 (class 1259 OID 17468)
-- Name: medidas; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.medidas (
    medidaid integer NOT NULL,
    tipoproductoid integer NOT NULL,
    nombremedida character varying(50) NOT NULL,
    descripcion character varying(100),
    alto numeric(10,2),
    ancho numeric(10,2),
    profundidad numeric(10,2),
    unidadmedida character varying(10) DEFAULT 'cm'::character varying,
    activo boolean DEFAULT true,
    orden integer DEFAULT 0,
    fechacreacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.medidas OWNER TO ferram;

--
-- TOC entry 5338 (class 0 OID 0)
-- Dependencies: 252
-- Name: TABLE medidas; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.medidas IS 'Medidas específicas para cada tipo de producto';


--
-- TOC entry 251 (class 1259 OID 17467)
-- Name: medidas_medidaid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.medidas_medidaid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.medidas_medidaid_seq OWNER TO ferram;

--
-- TOC entry 5339 (class 0 OID 0)
-- Dependencies: 251
-- Name: medidas_medidaid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.medidas_medidaid_seq OWNED BY public.medidas.medidaid;


--
-- TOC entry 266 (class 1259 OID 25507)
-- Name: notificaciones_notificacionid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.notificaciones_notificacionid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notificaciones_notificacionid_seq OWNER TO ferram;

--
-- TOC entry 5340 (class 0 OID 0)
-- Dependencies: 266
-- Name: notificaciones_notificacionid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.notificaciones_notificacionid_seq OWNED BY public.notificaciones.notificacionid;


--
-- TOC entry 246 (class 1259 OID 17423)
-- Name: ordenesdecompra; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.ordenesdecompra (
    ordencompraid integer NOT NULL,
    proveedorid integer NOT NULL,
    fechacreacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fechaentregaesperada date,
    estatus character varying(50) DEFAULT 'Pendiente'::character varying NOT NULL,
    origenoc character varying(20) DEFAULT 'manual'::character varying
);


ALTER TABLE public.ordenesdecompra OWNER TO ferram;

--
-- TOC entry 5341 (class 0 OID 0)
-- Dependencies: 246
-- Name: COLUMN ordenesdecompra.origenoc; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.ordenesdecompra.origenoc IS 'Origen de la orden: manual, backorder';


--
-- TOC entry 245 (class 1259 OID 17422)
-- Name: ordenesdecompra_ordencompraid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.ordenesdecompra_ordencompraid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ordenesdecompra_ordencompraid_seq OWNER TO ferram;

--
-- TOC entry 5342 (class 0 OID 0)
-- Dependencies: 245
-- Name: ordenesdecompra_ordencompraid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.ordenesdecompra_ordencompraid_seq OWNED BY public.ordenesdecompra.ordencompraid;


--
-- TOC entry 258 (class 1259 OID 17578)
-- Name: passwordresettokens; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.passwordresettokens (
    tokenid integer NOT NULL,
    token character varying(255) NOT NULL,
    clienteid integer,
    agenteid integer,
    expiraen timestamp without time zone NOT NULL,
    CONSTRAINT chk_passwordreset_referencia CHECK ((((clienteid IS NOT NULL) AND (agenteid IS NULL)) OR ((clienteid IS NULL) AND (agenteid IS NOT NULL))))
);


ALTER TABLE public.passwordresettokens OWNER TO ferram;

--
-- TOC entry 257 (class 1259 OID 17577)
-- Name: passwordresettokens_tokenid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.passwordresettokens_tokenid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.passwordresettokens_tokenid_seq OWNER TO ferram;

--
-- TOC entry 5343 (class 0 OID 0)
-- Dependencies: 257
-- Name: passwordresettokens_tokenid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.passwordresettokens_tokenid_seq OWNED BY public.passwordresettokens.tokenid;


--
-- TOC entry 234 (class 1259 OID 17326)
-- Name: pedidos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pedidos (
    pedidoid integer NOT NULL,
    clienteid integer NOT NULL,
    agenteid integer,
    direccionenvioid integer NOT NULL,
    fechapedido timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    montototal numeric(10,2) NOT NULL,
    estatus character varying(50) DEFAULT 'Pendiente'::character varying NOT NULL,
    costoenvio numeric(10,2) DEFAULT 0.00 NOT NULL
);


ALTER TABLE public.pedidos OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 17325)
-- Name: pedidos_pedidoid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pedidos_pedidoid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pedidos_pedidoid_seq OWNER TO postgres;

--
-- TOC entry 5344 (class 0 OID 0)
-- Dependencies: 233
-- Name: pedidos_pedidoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pedidos_pedidoid_seq OWNED BY public.pedidos.pedidoid;


--
-- TOC entry 226 (class 1259 OID 17267)
-- Name: producto_imagenes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.producto_imagenes (
    imagenid integer NOT NULL,
    url_imagen character varying(1024) NOT NULL,
    textoalternativo character varying(255),
    orden integer DEFAULT 0,
    productoid integer
);


ALTER TABLE public.producto_imagenes OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 17266)
-- Name: producto_imagenes_imagenid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.producto_imagenes_imagenid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.producto_imagenes_imagenid_seq OWNER TO postgres;

--
-- TOC entry 5345 (class 0 OID 0)
-- Dependencies: 225
-- Name: producto_imagenes_imagenid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.producto_imagenes_imagenid_seq OWNED BY public.producto_imagenes.imagenid;


--
-- TOC entry 265 (class 1259 OID 25448)
-- Name: producto_tamanosdisponibles; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.producto_tamanosdisponibles (
    productoid integer NOT NULL,
    tamanoid integer NOT NULL
);


ALTER TABLE public.producto_tamanosdisponibles OWNER TO ferram;

--
-- TOC entry 224 (class 1259 OID 17250)
-- Name: producto_variantes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.producto_variantes (
    varianteid integer NOT NULL,
    sku character varying(50) NOT NULL,
    dimensiones character varying(100),
    costounitario numeric(10,2) NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    tipoproductoid integer,
    medidaid integer,
    productoid integer,
    preciounitario numeric(10,2),
    precioofertaunitario numeric(10,2) DEFAULT NULL::numeric,
    activo boolean DEFAULT true,
    piezasporpaquete integer DEFAULT 1
);


ALTER TABLE public.producto_variantes OWNER TO postgres;

--
-- TOC entry 5346 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN producto_variantes.tipoproductoid; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.producto_variantes.tipoproductoid IS 'Formato físico del producto (Caja, Bolsa, etc.)';


--
-- TOC entry 223 (class 1259 OID 17249)
-- Name: producto_variantes_varianteid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.producto_variantes_varianteid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.producto_variantes_varianteid_seq OWNER TO postgres;

--
-- TOC entry 5347 (class 0 OID 0)
-- Dependencies: 223
-- Name: producto_variantes_varianteid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.producto_variantes_varianteid_seq OWNED BY public.producto_variantes.varianteid;


--
-- TOC entry 254 (class 1259 OID 17498)
-- Name: productos; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.productos (
    productoid integer NOT NULL,
    categoriaid integer NOT NULL,
    nombreproducto character varying(255) NOT NULL,
    descripcion text,
    activo boolean DEFAULT true,
    proveedorid_default integer,
    codigomodelo character varying(50),
    reglabackorder character varying(20) DEFAULT 'UNITARIO'::character varying,
    sku_maestro character varying(20),
    tipoproductoid integer,
    CONSTRAINT check_regla_backorder CHECK (((reglabackorder)::text = ANY ((ARRAY['UNITARIO'::character varying, 'PAQUETE'::character varying])::text[])))
);


ALTER TABLE public.productos OWNER TO ferram;

--
-- TOC entry 5348 (class 0 OID 0)
-- Dependencies: 254
-- Name: COLUMN productos.codigomodelo; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.productos.codigomodelo IS 'Código de modelo general del producto. Se usa para generar SKUs de variantes (ej: NAV25).';


--
-- TOC entry 253 (class 1259 OID 17497)
-- Name: productos_productoid_seq1; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.productos_productoid_seq1
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.productos_productoid_seq1 OWNER TO ferram;

--
-- TOC entry 5349 (class 0 OID 0)
-- Dependencies: 253
-- Name: productos_productoid_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.productos_productoid_seq1 OWNED BY public.productos.productoid;


--
-- TOC entry 244 (class 1259 OID 17414)
-- Name: proveedores; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.proveedores (
    proveedorid integer NOT NULL,
    nombreempresa character varying(255) NOT NULL,
    contactonombre character varying(255),
    email character varying(255),
    telefono character varying(50),
    razonsocial character varying(255),
    rfc character varying(20),
    regimenfiscal character varying(255),
    calle character varying(255),
    colonia character varying(100),
    codigopostal character varying(10),
    ciudad character varying(100),
    estado character varying(100),
    nombrerepresentanteventas character varying(255),
    celularventas character varying(20),
    emailventas character varying(255),
    nombrecontactocobranza character varying(255),
    telefonocobranza character varying(20),
    emailcobranza character varying(255),
    banco character varying(100),
    numerocuenta character varying(50),
    clabe character varying(20),
    referenciapago character varying(100),
    diascredito integer,
    limitecredito numeric(12,2),
    descuentofinanciero character varying(50),
    minimocompra character varying(100),
    aceptadevoluciones boolean
);


ALTER TABLE public.proveedores OWNER TO ferram;

--
-- TOC entry 243 (class 1259 OID 17413)
-- Name: proveedores_proveedorid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.proveedores_proveedorid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.proveedores_proveedorid_seq OWNER TO ferram;

--
-- TOC entry 5350 (class 0 OID 0)
-- Dependencies: 243
-- Name: proveedores_proveedorid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.proveedores_proveedorid_seq OWNED BY public.proveedores.proveedorid;


--
-- TOC entry 250 (class 1259 OID 17455)
-- Name: tipoproducto; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.tipoproducto (
    tipoproductoid integer NOT NULL,
    nombre character varying(50) NOT NULL,
    descripcion text,
    activo boolean DEFAULT true,
    fechacreacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tipoproducto OWNER TO ferram;

--
-- TOC entry 5351 (class 0 OID 0)
-- Dependencies: 250
-- Name: TABLE tipoproducto; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.tipoproducto IS 'Define el tipo físico del producto (Caja, Bolsa, Peluche, etc.)';


--
-- TOC entry 249 (class 1259 OID 17454)
-- Name: tipoproducto_tipoproductoid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.tipoproducto_tipoproductoid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tipoproducto_tipoproductoid_seq OWNER TO ferram;

--
-- TOC entry 5352 (class 0 OID 0)
-- Dependencies: 249
-- Name: tipoproducto_tipoproductoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.tipoproducto_tipoproductoid_seq OWNED BY public.tipoproducto.tipoproductoid;


--
-- TOC entry 4920 (class 2604 OID 17403)
-- Name: administradores adminid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.administradores ALTER COLUMN adminid SET DEFAULT nextval('public.administradores_adminid_seq'::regclass);


--
-- TOC entry 4891 (class 2604 OID 17225)
-- Name: agentesdeventas agenteid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agentesdeventas ALTER COLUMN agenteid SET DEFAULT nextval('public.agentesdeventas_agenteid_seq'::regclass);


--
-- TOC entry 4903 (class 2604 OID 17285)
-- Name: carritodecompra carritoid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.carritodecompra ALTER COLUMN carritoid SET DEFAULT nextval('public.carritodecompra_carritoid_seq'::regclass);


--
-- TOC entry 4948 (class 2604 OID 25443)
-- Name: cat_tamanopaquetes tamanoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_tamanopaquetes ALTER COLUMN tamanoid SET DEFAULT nextval('public.cat_tamanopaquetes_tamanoid_seq'::regclass);


--
-- TOC entry 4894 (class 2604 OID 17239)
-- Name: categorias categoriaid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categorias ALTER COLUMN categoriaid SET DEFAULT nextval('public.categorias_categoriaid_seq'::regclass);


--
-- TOC entry 4906 (class 2604 OID 17315)
-- Name: cliente_direcciones direccionid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cliente_direcciones ALTER COLUMN direccionid SET DEFAULT nextval('public.cliente_direcciones_direccionid_seq'::regclass);


--
-- TOC entry 4888 (class 2604 OID 17213)
-- Name: clientes clienteid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes ALTER COLUMN clienteid SET DEFAULT nextval('public.clientes_clienteid_seq'::regclass);


--
-- TOC entry 4915 (class 2604 OID 17370)
-- Name: comisiones comisionid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comisiones ALTER COLUMN comisionid SET DEFAULT nextval('public.comisiones_comisionid_seq'::regclass);


--
-- TOC entry 4942 (class 2604 OID 17554)
-- Name: communicationlogs logid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs ALTER COLUMN logid SET DEFAULT nextval('public.communicationlogs_logid_seq'::regclass);


--
-- TOC entry 4956 (class 2604 OID 33701)
-- Name: control_cambios id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.control_cambios ALTER COLUMN id SET DEFAULT nextval('public.control_cambios_id_seq'::regclass);


--
-- TOC entry 4911 (class 2604 OID 17353)
-- Name: detallesdelpedido detalleid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detallesdelpedido ALTER COLUMN detalleid SET DEFAULT nextval('public.detallesdelpedido_detalleid_seq'::regclass);


--
-- TOC entry 4929 (class 2604 OID 17440)
-- Name: detallesordencompra detalleoc_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra ALTER COLUMN detalleoc_id SET DEFAULT nextval('public.detallesordencompra_detalleoc_id_seq'::regclass);


--
-- TOC entry 4945 (class 2604 OID 25403)
-- Name: estados estadoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados ALTER COLUMN estadoid SET DEFAULT nextval('public.estados_estadoid_seq'::regclass);


--
-- TOC entry 4905 (class 2604 OID 17298)
-- Name: itemsdelcarrito itemid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.itemsdelcarrito ALTER COLUMN itemid SET DEFAULT nextval('public.itemsdelcarrito_itemid_seq'::regclass);


--
-- TOC entry 4946 (class 2604 OID 25419)
-- Name: log_eventosusuario eventoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario ALTER COLUMN eventoid SET DEFAULT nextval('public.log_eventosusuario_eventoid_seq'::regclass);


--
-- TOC entry 4918 (class 2604 OID 17389)
-- Name: log_inventario logid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.log_inventario ALTER COLUMN logid SET DEFAULT nextval('public.log_inventario_logid_seq'::regclass);


--
-- TOC entry 4954 (class 2604 OID 25545)
-- Name: log_movimientos logid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_movimientos ALTER COLUMN logid SET DEFAULT nextval('public.log_movimientos_logid_seq'::regclass);


--
-- TOC entry 4934 (class 2604 OID 17471)
-- Name: medidas medidaid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas ALTER COLUMN medidaid SET DEFAULT nextval('public.medidas_medidaid_seq'::regclass);


--
-- TOC entry 4949 (class 2604 OID 25511)
-- Name: notificaciones notificacionid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones ALTER COLUMN notificacionid SET DEFAULT nextval('public.notificaciones_notificacionid_seq'::regclass);


--
-- TOC entry 4925 (class 2604 OID 17426)
-- Name: ordenesdecompra ordencompraid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.ordenesdecompra ALTER COLUMN ordencompraid SET DEFAULT nextval('public.ordenesdecompra_ordencompraid_seq'::regclass);


--
-- TOC entry 4944 (class 2604 OID 17581)
-- Name: passwordresettokens tokenid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens ALTER COLUMN tokenid SET DEFAULT nextval('public.passwordresettokens_tokenid_seq'::regclass);


--
-- TOC entry 4907 (class 2604 OID 17329)
-- Name: pedidos pedidoid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pedidos ALTER COLUMN pedidoid SET DEFAULT nextval('public.pedidos_pedidoid_seq'::regclass);


--
-- TOC entry 4901 (class 2604 OID 17270)
-- Name: producto_imagenes imagenid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_imagenes ALTER COLUMN imagenid SET DEFAULT nextval('public.producto_imagenes_imagenid_seq'::regclass);


--
-- TOC entry 4896 (class 2604 OID 17253)
-- Name: producto_variantes varianteid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_variantes ALTER COLUMN varianteid SET DEFAULT nextval('public.producto_variantes_varianteid_seq'::regclass);


--
-- TOC entry 4939 (class 2604 OID 17501)
-- Name: productos productoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos ALTER COLUMN productoid SET DEFAULT nextval('public.productos_productoid_seq1'::regclass);


--
-- TOC entry 4924 (class 2604 OID 17417)
-- Name: proveedores proveedorid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedores ALTER COLUMN proveedorid SET DEFAULT nextval('public.proveedores_proveedorid_seq'::regclass);


--
-- TOC entry 4931 (class 2604 OID 17458)
-- Name: tipoproducto tipoproductoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.tipoproducto ALTER COLUMN tipoproductoid SET DEFAULT nextval('public.tipoproducto_tipoproductoid_seq'::regclass);


--
-- TOC entry 5280 (class 0 OID 17400)
-- Dependencies: 242
-- Data for Name: administradores; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.administradores (adminid, nombre, email, passwordhash, rol, activo, fechacreacion, apellido) VALUES (2, 'Fernando', 'fegarcia@hotmail.com', '$2b$10$qDMIe7cygYpnw13f67vMn.wxKqlrUV32fWdyXsUoRKDRw1XmrN/ma', 'superadmin', true, '2025-11-06 12:09:59.605448', 'Garcia                                                                                              ');


--
-- TOC entry 5258 (class 0 OID 17222)
-- Dependencies: 220
-- Data for Name: agentesdeventas; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.agentesdeventas (agenteid, nombre, apellido, email, passwordhash, codigoagente, activo, esadmin, adminrol) VALUES (11, 'Lupita', 'García', 'pupis_gr@hotmail.com', '$2b$10$C88fGzCOtyYIc2NMHU8oKe5Fx00tQUIjRe9.EjvM3RWWhebsIk.Gy', 'AG0001', true, false, NULL);


--
-- TOC entry 5266 (class 0 OID 17282)
-- Dependencies: 228
-- Data for Name: carritodecompra; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.carritodecompra (carritoid, clienteid, fechacreacion, ultimamodificacion) VALUES (40, 11, '2025-12-10 12:14:55.474501', NULL);
INSERT INTO public.carritodecompra (carritoid, clienteid, fechacreacion, ultimamodificacion) VALUES (7, 10, '2025-12-08 13:03:39.570669', '2025-12-11 10:13:10.964573');


--
-- TOC entry 5302 (class 0 OID 25440)
-- Dependencies: 264
-- Data for Name: cat_tamanopaquetes; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.cat_tamanopaquetes (tamanoid, cantidad) VALUES (1, 1);
INSERT INTO public.cat_tamanopaquetes (tamanoid, cantidad) VALUES (2, 3);
INSERT INTO public.cat_tamanopaquetes (tamanoid, cantidad) VALUES (3, 6);
INSERT INTO public.cat_tamanopaquetes (tamanoid, cantidad) VALUES (4, 12);
INSERT INTO public.cat_tamanopaquetes (tamanoid, cantidad) VALUES (5, 4);


--
-- TOC entry 5260 (class 0 OID 17236)
-- Dependencies: 222
-- Data for Name: categorias; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.categorias (categoriaid, nombre, descripcion, parentcategoriaid, activo) VALUES (14, 'Toda ocasión', 'Productos para todo el año con diversas líneas como: cumpleaños, feliz día y felicidades', NULL, true);
INSERT INTO public.categorias (categoriaid, nombre, descripcion, parentcategoriaid, activo) VALUES (15, 'Lisas', 'Cajas de diferentes colores perfectas para cualquier ocasión', NULL, true);
INSERT INTO public.categorias (categoriaid, nombre, descripcion, parentcategoriaid, activo) VALUES (16, 'Navidad', 'Cajas perfectas para decorar tu árbol navideño y hacer feliz a toda la familia', NULL, true);
INSERT INTO public.categorias (categoriaid, nombre, descripcion, parentcategoriaid, activo) VALUES (17, 'Natural', 'Cajas lisas de kraft sin diseño, perfectas para un regalo con toque minimalista', NULL, true);
INSERT INTO public.categorias (categoriaid, nombre, descripcion, parentcategoriaid, activo) VALUES (18, 'Amor y amistad', 'Cajas perfectas para regalar a esa persona especial', NULL, true);


--
-- TOC entry 5270 (class 0 OID 17312)
-- Dependencies: 232
-- Data for Name: cliente_direcciones; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.cliente_direcciones (direccionid, clienteid, etiqueta, receptor, calle, numeroext, numeroint, colonia, ciudad, codigopostal, telefonocontacto, estadoid) VALUES (6, 10, 'Casa', 'Diego Fernando Ramírez García', 'Paso de los Toros', '1821', '28', 'El Refugio', 'Queretaro', '76146', '5560989524', 22);


--
-- TOC entry 5256 (class 0 OID 17210)
-- Dependencies: 218
-- Data for Name: clientes; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.clientes (clienteid, nombre, apellido, email, passwordhash, telefono, fechaderegistro, activo, agenteid, google_id, avatar_url) VALUES (11, 'Fernando', 'Ramírez', 'dferramm@gmail.com', NULL, NULL, '2025-12-10 12:14:11.002742', true, NULL, '107035380971984210505', 'https://lh3.googleusercontent.com/a/ACg8ocKNxihdAINOrco8B52uUBljbYq3DjLlFlU9VsDVdeuo9DZ5IQ=s96-c');
INSERT INTO public.clientes (clienteid, nombre, apellido, email, passwordhash, telefono, fechaderegistro, activo, agenteid, google_id, avatar_url) VALUES (10, 'Fernando', 'Ramírez', 'dferram8@gmail.com', '$2b$10$gPvPWo/sunSuVPjFMl64N.1Iug0e8DE637ywNuQT2REY/EXG7wC4G', '5560989524', '2025-12-08 13:02:30.81628', true, 11, NULL, NULL);


--
-- TOC entry 5276 (class 0 OID 17367)
-- Dependencies: 238
-- Data for Name: comisiones; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5294 (class 0 OID 17551)
-- Dependencies: 256
-- Data for Name: communicationlogs; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (1, '2025-11-04 09:51:52.5292', 'dferramm@gmail.com', 'Instrucciones para restablecer tu contraseña', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (2, '2025-11-04 09:52:41.805447', 'dferramm@gmail.com', 'Instrucciones para restablecer tu contraseña', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (3, '2025-11-04 10:36:58.297226', 'dferramm@gmail.com', 'Instrucciones para restablecer tu contraseña', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (4, '2025-11-05 23:33:27.863651', 'dferram1m@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#12)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (5, '2025-11-18 20:18:52.983104', 'dferram8@gmail.com', 'Instrucciones para restablecer tu contraseña', 'Fallido', 'Invalid login: 535 5.7.8 Authentication failed', NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (6, '2025-11-18 21:09:19.187168', 'dferram8@gmail.com', 'Instrucciones para restablecer tu contraseña', 'Fallido', 'Invalid login: 535 5.7.8 Authentication failed', NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (7, '2025-11-18 21:13:41.185362', 'dferram8@gmail.com', 'Instrucciones para restablecer tu contraseña', 'Fallido', 'Invalid login: 535 5.7.8 Authentication failed', NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (8, '2025-11-18 21:17:38.094342', 'dferram8@gmail.com', 'Instrucciones para restablecer tu contraseña', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (9, '2025-11-19 15:15:13.337501', 'dferram8@gmail.com', 'Instrucciones para restablecer tu contraseña', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (10, '2025-11-19 15:18:55.686231', 'dferram8@gmail.com', 'Instrucciones para restablecer tu contraseña', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (11, '2025-11-19 22:11:13.416341', 'dferram8@gmail.com', 'Instrucciones para restablecer tu contraseña', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (12, '2025-11-26 12:49:08.069344', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #21', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (13, '2025-11-26 12:49:08.06974', 'dferram8@gmail.com', '💰 Nuevo Pedido #21 - $836.60', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (14, '2025-11-26 12:49:08.13181', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: FF-0104-CR', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (15, '2025-11-26 12:49:08.132393', 'pupis_gr@hotmail.com', '🔔 Tu cliente Diego Fernando ha realizado un pedido (#21)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (16, '2025-11-26 12:49:08.132836', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: FF-0105-CR', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (17, '2025-11-26 12:49:08.161971', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#21)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (18, '2025-11-26 17:10:13.263607', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: FF-0105-CR', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (19, '2025-11-26 17:10:13.267628', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#22)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (20, '2025-11-26 17:10:13.268016', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #22', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (21, '2025-11-26 17:10:13.271471', 'pupis_gr@hotmail.com', '🔔 Tu cliente Diego Fernando ha realizado un pedido (#22)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (22, '2025-11-26 17:10:13.272335', 'dferram8@gmail.com', '💰 Nuevo Pedido #22 - $778.80', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (23, '2025-12-06 21:15:56.109466', 'dferram8@gmail.com', 'Instrucciones para restablecer tu contraseña', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (25, '2025-12-06 21:54:12.165613', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#23)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (24, '2025-12-06 21:54:12.159128', 'dferram8@gmail.com', '💰 Nuevo Pedido #23 - $1557.60', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (26, '2025-12-06 21:54:12.177063', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: FF-0105-CR', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (27, '2025-12-06 21:54:13.057759', 'pupis_gr@hotmail.com', '🔔 Tu cliente Diego Fernando ha realizado un pedido (#23)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (28, '2025-12-06 21:54:13.104542', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #23', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (29, '2025-12-06 22:05:14.592967', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#24)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (30, '2025-12-06 22:05:14.593914', 'dferram8@gmail.com', '💰 Nuevo Pedido #24 - $5451.60', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (31, '2025-12-06 22:05:14.611757', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: FF-0105-CR', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (32, '2025-12-06 22:05:15.434451', 'pupis_gr@hotmail.com', '🔔 Tu cliente Diego Fernando ha realizado un pedido (#24)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (33, '2025-12-06 22:05:15.435788', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #24', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (34, '2025-12-06 22:10:32.727544', 'dferram8@gmail.com', '💰 Nuevo Pedido #25 - $1168.20', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (35, '2025-12-06 22:10:32.777723', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: FF-0105-CR', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (36, '2025-12-06 22:10:32.778664', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #25', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (37, '2025-12-06 22:10:32.779902', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#25)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (38, '2025-12-06 22:10:32.792133', 'pupis_gr@hotmail.com', '🔔 Tu cliente Diego Fernando ha realizado un pedido (#25)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (42, '2025-12-06 22:19:01.764702', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#27)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (40, '2025-12-06 22:19:01.763477', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: FF-0105-CR', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (39, '2025-12-06 22:19:01.761558', 'dferram8@gmail.com', '💰 Nuevo Pedido #27 - $2048.40', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (41, '2025-12-06 22:19:01.763266', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: FF-0104-CR', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (43, '2025-12-06 22:19:02.508665', 'pupis_gr@hotmail.com', '🔔 Tu cliente Diego Fernando ha realizado un pedido (#27)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (44, '2025-12-06 22:19:02.509793', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #27', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (45, '2025-12-07 11:57:50.047425', 'dferram8@gmail.com', '¡Tu pedido #27 ha sido confirmado!', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (46, '2025-12-07 12:30:03.5413', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: FF-0104-CR', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (47, '2025-12-07 14:33:00.432418', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#28)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (48, '2025-12-07 14:33:00.434835', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: pruebavariante1', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (49, '2025-12-07 14:33:00.435312', 'pupis_gr@hotmail.com', '🔔 Tu cliente Diego Fernando ha realizado un pedido (#28)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (50, '2025-12-07 14:33:00.498018', 'dferram8@gmail.com', '💰 Nuevo Pedido #28 - $42.00', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (52, '2025-12-07 14:33:15.485825', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #29', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (51, '2025-12-07 14:33:15.485343', 'dferram8@gmail.com', '💰 Nuevo Pedido #29 - $126.00', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (53, '2025-12-07 14:33:15.493351', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#29)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (54, '2025-12-07 14:33:15.651993', 'pupis_gr@hotmail.com', '🔔 Tu cliente Diego Fernando ha realizado un pedido (#29)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (55, '2025-12-07 14:33:15.652527', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: pruebavariante1', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (56, '2025-12-07 15:41:52.495808', 'dferram8@gmail.com', '💰 Nuevo Pedido #30 - $2030.40', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (57, '2025-12-07 15:41:52.495119', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#30)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (59, '2025-12-07 15:41:52.495579', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: FF-0104-CR', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (58, '2025-12-07 15:41:52.496015', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: pruebavariante1', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (60, '2025-12-07 15:41:52.496243', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #30', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (61, '2025-12-07 15:41:52.551373', 'pupis_gr@hotmail.com', '🔔 Tu cliente Diego Fernando ha realizado un pedido (#30)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (62, '2025-12-08 13:19:55.137401', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#31)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (65, '2025-12-08 13:19:55.139784', 'dferram8@gmail.com', '💰 Nuevo Pedido #31 - $1904.40', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (64, '2025-12-08 13:19:55.138758', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: FF-0104-CCA', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (63, '2025-12-08 13:19:55.140955', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #31', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (66, '2025-12-08 13:30:31.592263', 'dferram8@gmail.com', '¡Tu pedido #31 ha sido confirmado!', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (68, '2025-12-09 01:15:37.611249', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#32)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (67, '2025-12-09 01:15:37.606562', 'dferram8@gmail.com', '💰 Nuevo Pedido #32 - $7200.00', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (69, '2025-12-09 01:16:56.700291', 'dferram8@gmail.com', '💰 Nuevo Pedido #33 - $696900.00', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (70, '2025-12-09 01:16:56.720611', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#33)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (71, '2025-12-09 01:56:14.041129', 'dferram8@gmail.com', '¡Tu pedido #33 ha sido confirmado!', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (72, '2025-12-09 22:03:12.66946', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#34)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (73, '2025-12-09 22:03:12.706745', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #34', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (74, '2025-12-09 22:03:12.708293', 'dferram8@gmail.com', '💰 Nuevo Pedido #34 - $8186.10', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (75, '2025-12-09 22:03:12.713558', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: NAV-RED-05', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (76, '2025-12-09 22:06:21.352591', 'dferram8@gmail.com', 'Actualización sobre tu pedido #34', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (77, '2025-12-09 22:06:59.460283', 'dferram8@gmail.com', '¡Tu pedido #34 va en camino!', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (78, '2025-12-10 13:35:07.443393', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: NAV-GAL-02', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (79, '2025-12-10 14:08:14.382281', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#35)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (80, '2025-12-10 14:08:14.382949', 'dferram8@gmail.com', '💰 Nuevo Pedido #35 - $978.00', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (81, '2025-12-10 14:08:14.419607', 'pupis_gr@hotmail.com', '🔔 Tu cliente Fernando ha realizado un pedido (#35)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (82, '2025-12-10 14:08:14.420155', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #35', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (83, '2025-12-10 19:55:19.17792', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#36)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (84, '2025-12-10 19:55:19.179566', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #36', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (85, '2025-12-10 19:55:19.184169', 'dferram8@gmail.com', '💰 Nuevo Pedido #36 - $171.60', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (86, '2025-12-10 19:55:19.184939', 'pupis_gr@hotmail.com', '🔔 Tu cliente Fernando ha realizado un pedido (#36)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (87, '2025-12-10 23:57:40.201042', 'dferram8@gmail.com', '¡Tu pedido #35 va en camino!', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (88, '2025-12-10 23:57:43.938611', 'dferram8@gmail.com', '¡Tu pedido #36 ha sido confirmado!', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (89, '2025-12-11 10:13:21.853276', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#37)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (90, '2025-12-11 10:13:25.294134', 'pupis_gr@hotmail.com', '🔔 Tu cliente Fernando ha realizado un pedido (#37)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (91, '2025-12-11 10:13:25.333743', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #37', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (92, '2025-12-11 10:13:25.37497', 'dferram8@gmail.com', '💰 Nuevo Pedido #37 - $741.60', 'Enviado', NULL, NULL, NULL, NULL);


--
-- TOC entry 5309 (class 0 OID 33698)
-- Dependencies: 272
-- Data for Name: control_cambios; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (1, 'productos', 48, 'INSERT', NULL, '{"Activo": true, "CategoriaID": 16, "Descripcion": null, "CodigoModelo": "asd", "NombreProducto": "Prueba1", "ProveedorID_Default": 5}', 2, 'RECHAZADO', '2025-12-10 16:24:09.034721', '2025-12-10 16:30:11.629152', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (3, 'producto_variantes', NULL, 'INSERT', NULL, '{"sku": "PRUEBA1", "stock": 12, "activo": true, "medidaid": null, "productoid": 49, "dimensiones": "15x15", "costounitario": 10, "preciounitario": 100, "tipoproductoid": null, "precioofertaunitario": 50}', 2, 'RECHAZADO', '2025-12-10 17:14:51.230211', '2025-12-10 17:14:58.722151', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (2, 'productos', 49, 'INSERT', NULL, '{"Activo": true, "CategoriaID": 15, "Descripcion": null, "CodigoModelo": "asd", "NombreProducto": "Prueba1", "ProveedorID_Default": 5}', 2, 'RECHAZADO', '2025-12-10 17:14:29.729134', '2025-12-10 17:15:03.768042', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (4, 'productos', 50, 'INSERT', NULL, '{"Activo": true, "CategoriaID": 15, "Descripcion": null, "CodigoModelo": "asd", "NombreProducto": "Prueba1", "ProveedorID_Default": 5}', 2, 'RECHAZADO', '2025-12-10 17:16:44.490443', '2025-12-10 19:55:34.661327', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (5, 'producto_variantes', NULL, 'INSERT', NULL, '{"sku": "PRUEBA1", "stock": 24, "activo": true, "medidaid": null, "productoid": 50, "dimensiones": "15x15", "costounitario": 10, "preciounitario": 1000, "tipoproductoid": null, "precioofertaunitario": 400}', 2, 'RECHAZADO', '2025-12-10 17:17:03.065902', '2025-12-10 19:55:37.853518', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (7, 'clientes', 11, 'UPDATE', '{"email": "dferramm@gmail.com", "activo": true, "nombre": "Fernando", "agenteid": null, "apellido": "Ramírez", "telefono": null, "clienteid": 11, "google_id": "107035380971984210505", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocKNxihdAINOrco8B52uUBljbYq3DjLlFlU9VsDVdeuo9DZ5IQ=s96-c", "passwordhash": null, "fechaderegistro": "2025-12-10T18:14:11.002Z"}', '{"Activo": false}', 2, 'RECHAZADO', '2025-12-10 22:57:59.129183', '2025-12-10 22:58:25.316033', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (8, 'categorias', 18, 'UPDATE', '{"activo": true, "nombre": "Amor y amistad", "categoriaid": 18, "descripcion": "Cajas perfectas para regalar a esa persona especial", "parentcategoriaid": null}', '{"Activo": true, "Nombre": "Amor y amist", "Descripcion": "Cajas perfectas para regalar a esa persona especial", "ParentCategoriaID": null}', 2, 'RECHAZADO', '2025-12-10 23:17:02.198981', '2025-12-10 23:17:32.799671', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (9, 'clientes', 11, 'UPDATE', '{"email": "dferramm@gmail.com", "activo": true, "nombre": "Fernando", "agenteid": null, "apellido": "Ramírez", "telefono": null, "clienteid": 11, "google_id": "107035380971984210505", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocKNxihdAINOrco8B52uUBljbYq3DjLlFlU9VsDVdeuo9DZ5IQ=s96-c", "passwordhash": null, "fechaderegistro": "2025-12-10T18:14:11.002Z"}', '{"Activo": false}', 2, 'RECHAZADO', '2025-12-10 23:17:40.795132', '2025-12-10 23:17:53.948064', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (6, 'producto_variantes', 212, 'UPDATE', '{"sku": "NAV-GAL-01", "stock": 32, "activo": false, "varianteid": 212, "dimensiones": "20x20", "costounitario": "27.93", "preciounitario": "42.90", "precioofertaunitario": null}', '{"sku": "NAV-GAL-01", "activo": false, "dimensiones": "20x20", "costounitario": 27.93, "preciounitario": 42.9, "precioofertaunitario": null}', 2, 'RECHAZADO', '2025-12-10 22:56:09.635417', '2025-12-10 23:18:01.401011', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (10, 'pedidos', 37, 'UPDATE', '{"Estatus": "Pendiente"}', '{"Estatus": "Confirmado"}', 11, 'APROBADO', '2025-12-11 10:13:34.616117', '2025-12-11 10:25:41.266889', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (11, 'productos', 51, 'INSERT', NULL, '{"Activo": true, "CategoriaID": 16, "Descripcion": "Caja con un color rojo para que demuestres todo el amor que tienes para esas personas especiales en tu vida, decora tu hogar esta Navidad con nuestra \"Caja Cubo Rojo\"", "CodigoModelo": "CNAV-R", "NombreProducto": "Cubo Navidad Red", "ProveedorID_Default": 5}', 2, 'APROBADO', '2025-12-11 19:06:19.827873', '2025-12-11 19:11:31.159376', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (12, 'producto_variantes', 221, 'INSERT', NULL, '{"sku": "CNAV-R-01", "stock": 48, "activo": true, "medidaid": null, "productoid": 51, "dimensiones": "15x15", "costounitario": 20.93, "preciounitario": 30.9, "tipoproductoid": null, "precioofertaunitario": null}', 2, 'APROBADO', '2025-12-11 19:07:38.31974', '2025-12-11 19:11:34.353064', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (13, 'producto_variantes', NULL, 'INSERT', NULL, '{"sku": "CNAV-R-01", "stock": 24, "activo": true, "medidaid": null, "productoid": 52, "dimensiones": "15x15", "costounitario": 20.93, "preciounitario": 30.9, "tipoproductoid": null, "precioofertaunitario": null}', 2, 'RECHAZADO', '2025-12-11 19:13:37.588567', '2025-12-11 19:13:57.302883', 2);


--
-- TOC entry 5274 (class 0 OID 17350)
-- Dependencies: 236
-- Data for Name: detallesdelpedido; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5286 (class 0 OID 17437)
-- Dependencies: 248
-- Data for Name: detallesordencompra; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5298 (class 0 OID 25400)
-- Dependencies: 260
-- Data for Name: estados; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (1, 'Aguascalientes', 'AGS');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (2, 'Baja California', 'BC');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (3, 'Baja California Sur', 'BCS');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (4, 'Campeche', 'CAM');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (5, 'Chiapas', 'CHS');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (6, 'Chihuahua', 'CHH');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (7, 'Ciudad de México', 'CDMX');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (8, 'Coahuila', 'COA');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (9, 'Colima', 'COL');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (10, 'Durango', 'DGO');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (11, 'Guanajuato', 'GTO');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (12, 'Guerrero', 'GRO');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (13, 'Hidalgo', 'HGO');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (14, 'Jalisco', 'JAL');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (15, 'México', 'MEX');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (16, 'Michoacán', 'MCH');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (17, 'Morelos', 'MOR');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (18, 'Nayarit', 'NAY');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (19, 'Nuevo León', 'NL');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (20, 'Oaxaca', 'OAX');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (21, 'Puebla', 'PUE');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (22, 'Querétaro', 'QRO');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (23, 'Quintana Roo', 'QTR');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (24, 'San Luis Potosí', 'SLP');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (25, 'Sinaloa', 'SIN');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (26, 'Sonora', 'SON');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (27, 'Tabasco', 'TAB');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (28, 'Tamaulipas', 'TMS');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (29, 'Tlaxcala', 'TLX');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (30, 'Veracruz', 'VER');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (31, 'Yucatán', 'YUC');
INSERT INTO public.estados (estadoid, nombre, abreviatura) VALUES (32, 'Zacatecas', 'ZAC');


--
-- TOC entry 5268 (class 0 OID 17295)
-- Dependencies: 230
-- Data for Name: itemsdelcarrito; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5300 (class 0 OID 25416)
-- Dependencies: 262
-- Data for Name: log_eventosusuario; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5278 (class 0 OID 17386)
-- Dependencies: 240
-- Data for Name: log_inventario; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5307 (class 0 OID 25542)
-- Dependencies: 270
-- Data for Name: log_movimientos; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (42, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-11 18:58:58.72624');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (43, 2, 'fegarcia@hotmail.com', 'admin', 'CREAR', 'Producto', 51, '{"activo": false, "nombre": "Cubo Navidad Red", "categoriaId": 16, "proveedorId": 5, "codigoModelo": "CNAV-R"}', '::1', '2025-12-11 19:06:19.832512');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (44, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-11 19:12:05.575981');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (45, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-11 19:16:37.043882');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (46, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-11 19:30:26.365284');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (47, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-11 19:33:38.170471');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (48, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-11 20:47:44.620239');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (49, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-11 21:52:34.440204');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (50, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-11 23:20:50.637386');


--
-- TOC entry 5290 (class 0 OID 17468)
-- Dependencies: 252
-- Data for Name: medidas; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5305 (class 0 OID 25508)
-- Dependencies: 267
-- Data for Name: notificaciones; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5284 (class 0 OID 17423)
-- Dependencies: 246
-- Data for Name: ordenesdecompra; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5296 (class 0 OID 17578)
-- Dependencies: 258
-- Data for Name: passwordresettokens; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5272 (class 0 OID 17326)
-- Dependencies: 234
-- Data for Name: pedidos; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5264 (class 0 OID 17267)
-- Dependencies: 226
-- Data for Name: producto_imagenes; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (29, '/uploads/1765501579842-cubo_red_navidad.png', NULL, 1, 51);


--
-- TOC entry 5303 (class 0 OID 25448)
-- Dependencies: 265
-- Data for Name: producto_tamanosdisponibles; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (51, 3);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (51, 4);


--
-- TOC entry 5262 (class 0 OID 17250)
-- Dependencies: 224
-- Data for Name: producto_variantes; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete) VALUES (220, 'CNAV-R', NULL, 0.00, 0, 1, NULL, 51, NULL, NULL, false, 1);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete) VALUES (221, 'CNAV-R-01', '15x15', 20.93, 48, NULL, NULL, 51, 30.90, NULL, true, 1);


--
-- TOC entry 5292 (class 0 OID 17498)
-- Dependencies: 254
-- Data for Name: productos; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, codigomodelo, reglabackorder, sku_maestro, tipoproductoid) VALUES (51, 16, 'Cubo Navidad Red', 'Caja con un color rojo para que demuestres todo el amor que tienes para esas personas especiales en tu vida, decora tu hogar esta Navidad con nuestra "Caja Cubo Rojo"', true, 5, 'CNAV-R', 'PAQUETE', 'CNAV-R', NULL);


--
-- TOC entry 5282 (class 0 OID 17414)
-- Dependencies: 244
-- Data for Name: proveedores; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.proveedores (proveedorid, nombreempresa, contactonombre, email, telefono, razonsocial, rfc, regimenfiscal, calle, colonia, codigopostal, ciudad, estado, nombrerepresentanteventas, celularventas, emailventas, nombrecontactocobranza, telefonocobranza, emailcobranza, banco, numerocuenta, clabe, referenciapago, diascredito, limitecredito, descuentofinanciero, minimocompra, aceptadevoluciones) VALUES (5, 'Fashion', 'Víctor', NULL, '4771148648', 'Galibol SA. de CV', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Víctor Manuel Macias Hernández', '4771144868', NULL, 'Paola Plascencia', '4771358150', 'giselamacias70@gmail.com', 'BBVA Bancomer', '0199874593', '012225001998745935', 'Solo transferencia', 30, 500000.00, '30%', NULL, false);


--
-- TOC entry 5288 (class 0 OID 17455)
-- Dependencies: 250
-- Data for Name: tipoproducto; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.tipoproducto (tipoproductoid, nombre, descripcion, activo, fechacreacion) VALUES (1, 'Caja', NULL, true, '2025-12-11 19:06:19.742054');


--
-- TOC entry 5353 (class 0 OID 0)
-- Dependencies: 241
-- Name: administradores_adminid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.administradores_adminid_seq', 2, true);


--
-- TOC entry 5354 (class 0 OID 0)
-- Dependencies: 219
-- Name: agentesdeventas_agenteid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.agentesdeventas_agenteid_seq', 11, true);


--
-- TOC entry 5355 (class 0 OID 0)
-- Dependencies: 227
-- Name: carritodecompra_carritoid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.carritodecompra_carritoid_seq', 40, true);


--
-- TOC entry 5356 (class 0 OID 0)
-- Dependencies: 263
-- Name: cat_tamanopaquetes_tamanoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cat_tamanopaquetes_tamanoid_seq', 5, true);


--
-- TOC entry 5357 (class 0 OID 0)
-- Dependencies: 221
-- Name: categorias_categoriaid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.categorias_categoriaid_seq', 18, true);


--
-- TOC entry 5358 (class 0 OID 0)
-- Dependencies: 231
-- Name: cliente_direcciones_direccionid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cliente_direcciones_direccionid_seq', 6, true);


--
-- TOC entry 5359 (class 0 OID 0)
-- Dependencies: 217
-- Name: clientes_clienteid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.clientes_clienteid_seq', 11, true);


--
-- TOC entry 5360 (class 0 OID 0)
-- Dependencies: 237
-- Name: comisiones_comisionid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.comisiones_comisionid_seq', 22, true);


--
-- TOC entry 5361 (class 0 OID 0)
-- Dependencies: 255
-- Name: communicationlogs_logid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.communicationlogs_logid_seq', 92, true);


--
-- TOC entry 5362 (class 0 OID 0)
-- Dependencies: 271
-- Name: control_cambios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.control_cambios_id_seq', 13, true);


--
-- TOC entry 5363 (class 0 OID 0)
-- Dependencies: 235
-- Name: detallesdelpedido_detalleid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.detallesdelpedido_detalleid_seq', 41, true);


--
-- TOC entry 5364 (class 0 OID 0)
-- Dependencies: 247
-- Name: detallesordencompra_detalleoc_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.detallesordencompra_detalleoc_id_seq', 23, true);


--
-- TOC entry 5365 (class 0 OID 0)
-- Dependencies: 259
-- Name: estados_estadoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.estados_estadoid_seq', 32, true);


--
-- TOC entry 5366 (class 0 OID 0)
-- Dependencies: 229
-- Name: itemsdelcarrito_itemid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.itemsdelcarrito_itemid_seq', 60, true);


--
-- TOC entry 5367 (class 0 OID 0)
-- Dependencies: 261
-- Name: log_eventosusuario_eventoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.log_eventosusuario_eventoid_seq', 1, false);


--
-- TOC entry 5368 (class 0 OID 0)
-- Dependencies: 239
-- Name: log_inventario_logid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.log_inventario_logid_seq', 98, true);


--
-- TOC entry 5369 (class 0 OID 0)
-- Dependencies: 269
-- Name: log_movimientos_logid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.log_movimientos_logid_seq', 50, true);


--
-- TOC entry 5370 (class 0 OID 0)
-- Dependencies: 251
-- Name: medidas_medidaid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.medidas_medidaid_seq', 1, false);


--
-- TOC entry 5371 (class 0 OID 0)
-- Dependencies: 266
-- Name: notificaciones_notificacionid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.notificaciones_notificacionid_seq', 3, true);


--
-- TOC entry 5372 (class 0 OID 0)
-- Dependencies: 245
-- Name: ordenesdecompra_ordencompraid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.ordenesdecompra_ordencompraid_seq', 15, true);


--
-- TOC entry 5373 (class 0 OID 0)
-- Dependencies: 257
-- Name: passwordresettokens_tokenid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.passwordresettokens_tokenid_seq', 11, true);


--
-- TOC entry 5374 (class 0 OID 0)
-- Dependencies: 233
-- Name: pedidos_pedidoid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pedidos_pedidoid_seq', 37, true);


--
-- TOC entry 5375 (class 0 OID 0)
-- Dependencies: 225
-- Name: producto_imagenes_imagenid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.producto_imagenes_imagenid_seq', 29, true);


--
-- TOC entry 5376 (class 0 OID 0)
-- Dependencies: 223
-- Name: producto_variantes_varianteid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.producto_variantes_varianteid_seq', 222, true);


--
-- TOC entry 5377 (class 0 OID 0)
-- Dependencies: 253
-- Name: productos_productoid_seq1; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.productos_productoid_seq1', 52, true);


--
-- TOC entry 5378 (class 0 OID 0)
-- Dependencies: 243
-- Name: proveedores_proveedorid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.proveedores_proveedorid_seq', 5, true);


--
-- TOC entry 5379 (class 0 OID 0)
-- Dependencies: 249
-- Name: tipoproducto_tipoproductoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.tipoproducto_tipoproductoid_seq', 1, true);


--
-- TOC entry 5004 (class 2606 OID 17412)
-- Name: administradores administradores_email_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.administradores
    ADD CONSTRAINT administradores_email_key UNIQUE (email);


--
-- TOC entry 5006 (class 2606 OID 17410)
-- Name: administradores administradores_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.administradores
    ADD CONSTRAINT administradores_pkey PRIMARY KEY (adminid);


--
-- TOC entry 4973 (class 2606 OID 17234)
-- Name: agentesdeventas agentesdeventas_codigoagente_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agentesdeventas
    ADD CONSTRAINT agentesdeventas_codigoagente_key UNIQUE (codigoagente);


--
-- TOC entry 4975 (class 2606 OID 17232)
-- Name: agentesdeventas agentesdeventas_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agentesdeventas
    ADD CONSTRAINT agentesdeventas_email_key UNIQUE (email);


--
-- TOC entry 4977 (class 2606 OID 17230)
-- Name: agentesdeventas agentesdeventas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agentesdeventas
    ADD CONSTRAINT agentesdeventas_pkey PRIMARY KEY (agenteid);


--
-- TOC entry 4990 (class 2606 OID 17288)
-- Name: carritodecompra carritodecompra_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.carritodecompra
    ADD CONSTRAINT carritodecompra_pkey PRIMARY KEY (carritoid);


--
-- TOC entry 5048 (class 2606 OID 25447)
-- Name: cat_tamanopaquetes cat_tamanopaquetes_cantidad_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_tamanopaquetes
    ADD CONSTRAINT cat_tamanopaquetes_cantidad_key UNIQUE (cantidad);


--
-- TOC entry 5050 (class 2606 OID 25445)
-- Name: cat_tamanopaquetes cat_tamanopaquetes_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_tamanopaquetes
    ADD CONSTRAINT cat_tamanopaquetes_pkey PRIMARY KEY (tamanoid);


--
-- TOC entry 4979 (class 2606 OID 17243)
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (categoriaid);


--
-- TOC entry 4994 (class 2606 OID 17319)
-- Name: cliente_direcciones cliente_direcciones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cliente_direcciones
    ADD CONSTRAINT cliente_direcciones_pkey PRIMARY KEY (direccionid);


--
-- TOC entry 4966 (class 2606 OID 17220)
-- Name: clientes clientes_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_email_key UNIQUE (email);


--
-- TOC entry 4968 (class 2606 OID 33680)
-- Name: clientes clientes_google_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_google_id_key UNIQUE (google_id);


--
-- TOC entry 4970 (class 2606 OID 17218)
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (clienteid);


--
-- TOC entry 5000 (class 2606 OID 17374)
-- Name: comisiones comisiones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_pkey PRIMARY KEY (comisionid);


--
-- TOC entry 5030 (class 2606 OID 17560)
-- Name: communicationlogs communicationlogs_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT communicationlogs_pkey PRIMARY KEY (logid);


--
-- TOC entry 5066 (class 2606 OID 33707)
-- Name: control_cambios control_cambios_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.control_cambios
    ADD CONSTRAINT control_cambios_pkey PRIMARY KEY (id);


--
-- TOC entry 4998 (class 2606 OID 17355)
-- Name: detallesdelpedido detallesdelpedido_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT detallesdelpedido_pkey PRIMARY KEY (detalleid);


--
-- TOC entry 5013 (class 2606 OID 17443)
-- Name: detallesordencompra detallesordencompra_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra
    ADD CONSTRAINT detallesordencompra_pkey PRIMARY KEY (detalleoc_id);


--
-- TOC entry 5036 (class 2606 OID 25409)
-- Name: estados estados_abreviatura_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados
    ADD CONSTRAINT estados_abreviatura_key UNIQUE (abreviatura);


--
-- TOC entry 5038 (class 2606 OID 25407)
-- Name: estados estados_nombre_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados
    ADD CONSTRAINT estados_nombre_key UNIQUE (nombre);


--
-- TOC entry 5040 (class 2606 OID 25405)
-- Name: estados estados_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados
    ADD CONSTRAINT estados_pkey PRIMARY KEY (estadoid);


--
-- TOC entry 4992 (class 2606 OID 17300)
-- Name: itemsdelcarrito itemsdelcarrito_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT itemsdelcarrito_pkey PRIMARY KEY (itemid);


--
-- TOC entry 5046 (class 2606 OID 25424)
-- Name: log_eventosusuario log_eventosusuario_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario
    ADD CONSTRAINT log_eventosusuario_pkey PRIMARY KEY (eventoid);


--
-- TOC entry 5002 (class 2606 OID 17392)
-- Name: log_inventario log_inventario_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.log_inventario
    ADD CONSTRAINT log_inventario_pkey PRIMARY KEY (logid);


--
-- TOC entry 5064 (class 2606 OID 25551)
-- Name: log_movimientos log_movimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_movimientos
    ADD CONSTRAINT log_movimientos_pkey PRIMARY KEY (logid);


--
-- TOC entry 5020 (class 2606 OID 17477)
-- Name: medidas medidas_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas
    ADD CONSTRAINT medidas_pkey PRIMARY KEY (medidaid);


--
-- TOC entry 5022 (class 2606 OID 17479)
-- Name: medidas medidas_tipoproductoid_nombremedida_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas
    ADD CONSTRAINT medidas_tipoproductoid_nombremedida_key UNIQUE (tipoproductoid, nombremedida);


--
-- TOC entry 5058 (class 2606 OID 25521)
-- Name: notificaciones notificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_pkey PRIMARY KEY (notificacionid);


--
-- TOC entry 5011 (class 2606 OID 17430)
-- Name: ordenesdecompra ordenesdecompra_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.ordenesdecompra
    ADD CONSTRAINT ordenesdecompra_pkey PRIMARY KEY (ordencompraid);


--
-- TOC entry 5032 (class 2606 OID 17584)
-- Name: passwordresettokens passwordresettokens_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT passwordresettokens_pkey PRIMARY KEY (tokenid);


--
-- TOC entry 5034 (class 2606 OID 17586)
-- Name: passwordresettokens passwordresettokens_token_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT passwordresettokens_token_key UNIQUE (token);


--
-- TOC entry 4996 (class 2606 OID 17333)
-- Name: pedidos pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_pkey PRIMARY KEY (pedidoid);


--
-- TOC entry 4988 (class 2606 OID 17275)
-- Name: producto_imagenes producto_imagenes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_imagenes
    ADD CONSTRAINT producto_imagenes_pkey PRIMARY KEY (imagenid);


--
-- TOC entry 5052 (class 2606 OID 25452)
-- Name: producto_tamanosdisponibles producto_tamanosdisponibles_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_tamanosdisponibles
    ADD CONSTRAINT producto_tamanosdisponibles_pkey PRIMARY KEY (productoid, tamanoid);


--
-- TOC entry 4984 (class 2606 OID 17258)
-- Name: producto_variantes productos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_pkey PRIMARY KEY (varianteid);


--
-- TOC entry 5026 (class 2606 OID 17506)
-- Name: productos productos_pkey1; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey1 PRIMARY KEY (productoid);


--
-- TOC entry 4986 (class 2606 OID 17260)
-- Name: producto_variantes productos_sku_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_sku_key UNIQUE (sku);


--
-- TOC entry 5028 (class 2606 OID 33716)
-- Name: productos productos_sku_maestro_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_sku_maestro_key UNIQUE (sku_maestro);


--
-- TOC entry 5008 (class 2606 OID 17421)
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (proveedorid);


--
-- TOC entry 5015 (class 2606 OID 17466)
-- Name: tipoproducto tipoproducto_nombre_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.tipoproducto
    ADD CONSTRAINT tipoproducto_nombre_key UNIQUE (nombre);


--
-- TOC entry 5017 (class 2606 OID 17464)
-- Name: tipoproducto tipoproducto_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.tipoproducto
    ADD CONSTRAINT tipoproducto_pkey PRIMARY KEY (tipoproductoid);


--
-- TOC entry 4980 (class 1259 OID 25506)
-- Name: idx_categoria_activo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_categoria_activo ON public.categorias USING btree (activo);


--
-- TOC entry 4971 (class 1259 OID 25478)
-- Name: idx_cliente_agente; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cliente_agente ON public.clientes USING btree (agenteid);


--
-- TOC entry 5067 (class 1259 OID 33709)
-- Name: idx_control_cambios_entidad; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_control_cambios_entidad ON public.control_cambios USING btree (entidad, entidad_id);


--
-- TOC entry 5068 (class 1259 OID 33708)
-- Name: idx_control_cambios_estado; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_control_cambios_estado ON public.control_cambios USING btree (estado);


--
-- TOC entry 5059 (class 1259 OID 25558)
-- Name: idx_log_accion; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_accion ON public.log_movimientos USING btree (accion);


--
-- TOC entry 5041 (class 1259 OID 25436)
-- Name: idx_log_clienteid; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_clienteid ON public.log_eventosusuario USING btree (clienteid);


--
-- TOC entry 5060 (class 1259 OID 25560)
-- Name: idx_log_entidad; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_entidad ON public.log_movimientos USING btree (entidad, entidadid);


--
-- TOC entry 5061 (class 1259 OID 25557)
-- Name: idx_log_fecha; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_fecha ON public.log_movimientos USING btree (fecha DESC);


--
-- TOC entry 5042 (class 1259 OID 25438)
-- Name: idx_log_timestamp; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_timestamp ON public.log_eventosusuario USING btree ("timestamp");


--
-- TOC entry 5043 (class 1259 OID 25435)
-- Name: idx_log_tipoevento; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_tipoevento ON public.log_eventosusuario USING btree (tipoevento);


--
-- TOC entry 5062 (class 1259 OID 25559)
-- Name: idx_log_usuario; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_usuario ON public.log_movimientos USING btree (usuarioid);


--
-- TOC entry 5044 (class 1259 OID 25437)
-- Name: idx_log_varianteid; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_varianteid ON public.log_eventosusuario USING btree (varianteid);


--
-- TOC entry 5018 (class 1259 OID 17495)
-- Name: idx_medidas_tipoproducto; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_medidas_tipoproducto ON public.medidas USING btree (tipoproductoid);


--
-- TOC entry 5053 (class 1259 OID 25527)
-- Name: idx_notificaciones_clienteid; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_clienteid ON public.notificaciones USING btree (clienteid);


--
-- TOC entry 5054 (class 1259 OID 25530)
-- Name: idx_notificaciones_fecha; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_fecha ON public.notificaciones USING btree (fechacreacion DESC);


--
-- TOC entry 5055 (class 1259 OID 25528)
-- Name: idx_notificaciones_leida; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_leida ON public.notificaciones USING btree (leida);


--
-- TOC entry 5056 (class 1259 OID 25529)
-- Name: idx_notificaciones_tipo; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_tipo ON public.notificaciones USING btree (tipo);


--
-- TOC entry 5009 (class 1259 OID 25490)
-- Name: idx_ordenesdecompra_origenoc; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_ordenesdecompra_origenoc ON public.ordenesdecompra USING btree (origenoc);


--
-- TOC entry 5023 (class 1259 OID 25505)
-- Name: idx_producto_activo; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_producto_activo ON public.productos USING btree (activo);


--
-- TOC entry 4981 (class 1259 OID 25487)
-- Name: idx_producto_oferta; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_producto_oferta ON public.producto_variantes USING btree (precioofertaunitario) WHERE (precioofertaunitario IS NOT NULL);


--
-- TOC entry 5024 (class 1259 OID 25485)
-- Name: idx_productos_codigomodelo; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_productos_codigomodelo ON public.productos USING btree (codigomodelo) WHERE (codigomodelo IS NOT NULL);


--
-- TOC entry 4982 (class 1259 OID 17496)
-- Name: idx_productos_tipoproducto; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_productos_tipoproducto ON public.producto_variantes USING btree (tipoproductoid);


--
-- TOC entry 5108 (class 2620 OID 25533)
-- Name: notificaciones trigger_limitar_notificaciones; Type: TRIGGER; Schema: public; Owner: ferram
--

CREATE TRIGGER trigger_limitar_notificaciones AFTER INSERT ON public.notificaciones FOR EACH ROW EXECUTE FUNCTION public.limitar_notificaciones_por_cliente();


--
-- TOC entry 5075 (class 2606 OID 17289)
-- Name: carritodecompra carritodecompra_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.carritodecompra
    ADD CONSTRAINT carritodecompra_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 5070 (class 2606 OID 17244)
-- Name: categorias categorias_parentcategoriaid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_parentcategoriaid_fkey FOREIGN KEY (parentcategoriaid) REFERENCES public.categorias(categoriaid);


--
-- TOC entry 5079 (class 2606 OID 17320)
-- Name: cliente_direcciones cliente_direcciones_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cliente_direcciones
    ADD CONSTRAINT cliente_direcciones_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 5087 (class 2606 OID 17380)
-- Name: comisiones comisiones_agenteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_agenteid_fkey FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid);


--
-- TOC entry 5088 (class 2606 OID 17375)
-- Name: comisiones comisiones_pedidoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_pedidoid_fkey FOREIGN KEY (pedidoid) REFERENCES public.pedidos(pedidoid);


--
-- TOC entry 5084 (class 2606 OID 17356)
-- Name: detallesdelpedido detallesdelpedido_pedidoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT detallesdelpedido_pedidoid_fkey FOREIGN KEY (pedidoid) REFERENCES public.pedidos(pedidoid);


--
-- TOC entry 5091 (class 2606 OID 17444)
-- Name: detallesordencompra detallesordencompra_ordencompraid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra
    ADD CONSTRAINT detallesordencompra_ordencompraid_fkey FOREIGN KEY (ordencompraid) REFERENCES public.ordenesdecompra(ordencompraid);


--
-- TOC entry 5097 (class 2606 OID 17566)
-- Name: communicationlogs fk_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT fk_cliente FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 5069 (class 2606 OID 25473)
-- Name: clientes fk_cliente_agente; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT fk_cliente_agente FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid);


--
-- TOC entry 5080 (class 2606 OID 25410)
-- Name: cliente_direcciones fk_cliente_estado; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cliente_direcciones
    ADD CONSTRAINT fk_cliente_estado FOREIGN KEY (estadoid) REFERENCES public.estados(estadoid);


--
-- TOC entry 5085 (class 2606 OID 25463)
-- Name: detallesdelpedido fk_detalles_tamano; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT fk_detalles_tamano FOREIGN KEY (tamanoid) REFERENCES public.cat_tamanopaquetes(tamanoid);


--
-- TOC entry 5086 (class 2606 OID 17518)
-- Name: detallesdelpedido fk_detallesdelpedido_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT fk_detallesdelpedido_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 5092 (class 2606 OID 17538)
-- Name: detallesordencompra fk_detallesordencompra_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra
    ADD CONSTRAINT fk_detallesordencompra_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 5074 (class 2606 OID 25499)
-- Name: producto_imagenes fk_imagen_producto_maestro; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_imagenes
    ADD CONSTRAINT fk_imagen_producto_maestro FOREIGN KEY (productoid) REFERENCES public.productos(productoid) ON DELETE CASCADE;


--
-- TOC entry 5076 (class 2606 OID 25468)
-- Name: itemsdelcarrito fk_items_tamano; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT fk_items_tamano FOREIGN KEY (tamanoid) REFERENCES public.cat_tamanopaquetes(tamanoid);


--
-- TOC entry 5077 (class 2606 OID 17523)
-- Name: itemsdelcarrito fk_itemsdelcarrito_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT fk_itemsdelcarrito_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 5102 (class 2606 OID 25425)
-- Name: log_eventosusuario fk_log_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario
    ADD CONSTRAINT fk_log_cliente FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 5107 (class 2606 OID 25552)
-- Name: log_movimientos fk_log_usuario; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_movimientos
    ADD CONSTRAINT fk_log_usuario FOREIGN KEY (usuarioid) REFERENCES public.administradores(adminid) ON DELETE SET NULL;


--
-- TOC entry 5103 (class 2606 OID 25430)
-- Name: log_eventosusuario fk_log_variante; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario
    ADD CONSTRAINT fk_log_variante FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 5089 (class 2606 OID 17533)
-- Name: log_inventario fk_loginventario_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.log_inventario
    ADD CONSTRAINT fk_loginventario_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 5100 (class 2606 OID 17592)
-- Name: passwordresettokens fk_passwordreset_agente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT fk_passwordreset_agente FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid) ON DELETE CASCADE;


--
-- TOC entry 5101 (class 2606 OID 17587)
-- Name: passwordresettokens fk_passwordreset_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT fk_passwordreset_cliente FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 5098 (class 2606 OID 17561)
-- Name: communicationlogs fk_pedido; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT fk_pedido FOREIGN KEY (pedidoid) REFERENCES public.pedidos(pedidoid);


--
-- TOC entry 5071 (class 2606 OID 17512)
-- Name: producto_variantes fk_producto_maestro; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT fk_producto_maestro FOREIGN KEY (productoid) REFERENCES public.productos(productoid);


--
-- TOC entry 5094 (class 2606 OID 33717)
-- Name: productos fk_producto_tipo; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT fk_producto_tipo FOREIGN KEY (tipoproductoid) REFERENCES public.tipoproducto(tipoproductoid);


--
-- TOC entry 5099 (class 2606 OID 17571)
-- Name: communicationlogs fk_proveedor; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT fk_proveedor FOREIGN KEY (proveedorid) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 5095 (class 2606 OID 25480)
-- Name: productos fk_proveedor_default; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT fk_proveedor_default FOREIGN KEY (proveedorid_default) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 5104 (class 2606 OID 25453)
-- Name: producto_tamanosdisponibles fk_tamanos_producto; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_tamanosdisponibles
    ADD CONSTRAINT fk_tamanos_producto FOREIGN KEY (productoid) REFERENCES public.productos(productoid);


--
-- TOC entry 5105 (class 2606 OID 25458)
-- Name: producto_tamanosdisponibles fk_tamanos_tamano; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_tamanosdisponibles
    ADD CONSTRAINT fk_tamanos_tamano FOREIGN KEY (tamanoid) REFERENCES public.cat_tamanopaquetes(tamanoid);


--
-- TOC entry 5078 (class 2606 OID 17543)
-- Name: itemsdelcarrito itemsdelcarrito_carritoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT itemsdelcarrito_carritoid_fkey FOREIGN KEY (carritoid) REFERENCES public.carritodecompra(carritoid);


--
-- TOC entry 5093 (class 2606 OID 17480)
-- Name: medidas medidas_tipoproductoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas
    ADD CONSTRAINT medidas_tipoproductoid_fkey FOREIGN KEY (tipoproductoid) REFERENCES public.tipoproducto(tipoproductoid);


--
-- TOC entry 5106 (class 2606 OID 25522)
-- Name: notificaciones notificaciones_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 5090 (class 2606 OID 17431)
-- Name: ordenesdecompra ordenesdecompra_proveedorid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.ordenesdecompra
    ADD CONSTRAINT ordenesdecompra_proveedorid_fkey FOREIGN KEY (proveedorid) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 5081 (class 2606 OID 17339)
-- Name: pedidos pedidos_agenteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_agenteid_fkey FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid);


--
-- TOC entry 5082 (class 2606 OID 17334)
-- Name: pedidos pedidos_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 5083 (class 2606 OID 17344)
-- Name: pedidos pedidos_direccionenvioid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_direccionenvioid_fkey FOREIGN KEY (direccionenvioid) REFERENCES public.cliente_direcciones(direccionid);


--
-- TOC entry 5096 (class 2606 OID 17507)
-- Name: productos productos_categoriaid_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_categoriaid_fkey1 FOREIGN KEY (categoriaid) REFERENCES public.categorias(categoriaid);


--
-- TOC entry 5072 (class 2606 OID 17490)
-- Name: producto_variantes productos_medidaid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_medidaid_fkey FOREIGN KEY (medidaid) REFERENCES public.medidas(medidaid);


--
-- TOC entry 5073 (class 2606 OID 17485)
-- Name: producto_variantes productos_tipoproductoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_tipoproductoid_fkey FOREIGN KEY (tipoproductoid) REFERENCES public.tipoproducto(tipoproductoid);


-- Completed on 2025-12-11 23:33:39

--
-- PostgreSQL database dump complete
--

