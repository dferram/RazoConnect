--
-- PostgreSQL database dump
--

-- Dumped from database version 17.7
-- Dumped by pg_dump version 17.5

-- Started on 2026-01-07 20:43:10

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
-- TOC entry 3 (class 3079 OID 24742)
-- Name: pg_cron; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;


--
-- TOC entry 4929 (class 0 OID 0)
-- Dependencies: 3
-- Name: EXTENSION pg_cron; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL';


--
-- TOC entry 8 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: azure_pg_admin
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO azure_pg_admin;

--
-- TOC entry 4 (class 3079 OID 24803)
-- Name: azure; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS azure WITH SCHEMA pg_catalog;


--
-- TOC entry 4931 (class 0 OID 0)
-- Dependencies: 4
-- Name: EXTENSION azure; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION azure IS 'azure extension for PostgreSQL service';


--
-- TOC entry 2 (class 3079 OID 24577)
-- Name: pgaadauth; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgaadauth WITH SCHEMA pg_catalog;


--
-- TOC entry 4932 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pgaadauth; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgaadauth IS 'Microsoft Entra ID Authentication';


--
-- TOC entry 986 (class 1247 OID 24963)
-- Name: estado_solicitud_enum; Type: TYPE; Schema: public; Owner: ferram
--

CREATE TYPE public.estado_solicitud_enum AS ENUM (
    'PENDIENTE',
    'APROBADO',
    'RECHAZADO'
);


ALTER TYPE public.estado_solicitud_enum OWNER TO ferram;

--
-- TOC entry 989 (class 1247 OID 24970)
-- Name: estatus_aplicacion_enum; Type: TYPE; Schema: public; Owner: ferram
--

CREATE TYPE public.estatus_aplicacion_enum AS ENUM (
    'PENDIENTE',
    'APLICADO',
    'NO_APLICADO'
);


ALTER TYPE public.estatus_aplicacion_enum OWNER TO ferram;

--
-- TOC entry 992 (class 1247 OID 24978)
-- Name: estatus_conteo_enum; Type: TYPE; Schema: public; Owner: ferram
--

CREATE TYPE public.estatus_conteo_enum AS ENUM (
    'PENDIENTE_A',
    'PENDIENTE_B',
    'CONFLICTO',
    'VALIDADO'
);


ALTER TYPE public.estatus_conteo_enum OWNER TO ferram;

--
-- TOC entry 995 (class 1247 OID 24988)
-- Name: estatus_cxp_enum; Type: TYPE; Schema: public; Owner: ferram
--

CREATE TYPE public.estatus_cxp_enum AS ENUM (
    'PENDIENTE',
    'PARCIAL',
    'PAGADO',
    'VENCIDO',
    'CANCELADO'
);


ALTER TYPE public.estatus_cxp_enum OWNER TO ferram;

--
-- TOC entry 998 (class 1247 OID 25000)
-- Name: estatus_sesion_enum; Type: TYPE; Schema: public; Owner: ferram
--

CREATE TYPE public.estatus_sesion_enum AS ENUM (
    'ABIERTA',
    'CERRADA',
    'APLICADA',
    'APLICADA_PARCIAL'
);


ALTER TYPE public.estatus_sesion_enum OWNER TO ferram;

--
-- TOC entry 1001 (class 1247 OID 25010)
-- Name: tipo_cambio_enum; Type: TYPE; Schema: public; Owner: ferram
--

CREATE TYPE public.tipo_cambio_enum AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE'
);


ALTER TYPE public.tipo_cambio_enum OWNER TO ferram;

--
-- TOC entry 350 (class 1255 OID 25964)
-- Name: get_stock_admin(integer, integer); Type: FUNCTION; Schema: public; Owner: ferram
--

CREATE FUNCTION public.get_stock_admin(p_admin_id integer, p_variante_id integer) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_cantidad INTEGER;
BEGIN
    SELECT COALESCE(cantidad, 0) INTO v_cantidad
    FROM public.inventarios_admin
    WHERE admin_id = p_admin_id 
    AND variante_id = p_variante_id;
    
    RETURN COALESCE(v_cantidad, 0);
END;
$$;


ALTER FUNCTION public.get_stock_admin(p_admin_id integer, p_variante_id integer) OWNER TO ferram;

--
-- TOC entry 4956 (class 0 OID 0)
-- Dependencies: 350
-- Name: FUNCTION get_stock_admin(p_admin_id integer, p_variante_id integer); Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON FUNCTION public.get_stock_admin(p_admin_id integer, p_variante_id integer) IS 'Obtiene el stock de una variante para un administrador específico';


--
-- TOC entry 360 (class 1255 OID 25017)
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
-- TOC entry 361 (class 1255 OID 25018)
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

--
-- TOC entry 362 (class 1255 OID 25019)
-- Name: obtener_siguiente_sku(integer); Type: FUNCTION; Schema: public; Owner: ferram
--

CREATE FUNCTION public.obtener_siguiente_sku(p_categoria_id integer) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_prefijo VARCHAR(3);
    v_consecutivo INT;
    v_sku_nuevo VARCHAR;
BEGIN
    -- 1. Obtener las 3 primeras letras de la categoría (Ej: 'Cajas' -> 'CAJ')
    SELECT UPPER(SUBSTRING(nombre, 1, 3)) INTO v_prefijo
    FROM categorias WHERE categoriaid = p_categoria_id;

    -- 2. Buscar el último consecutivo usado para ese prefijo
    -- Extraer solo la parte numérica inmediatamente después del prefijo (antes de cualquier otro guion)
    -- Ejemplo: "CAJ-018-20X20" -> extraer "018" -> convertir a 18
    SELECT COALESCE(
        MAX(
            CAST(
                SUBSTRING(
                    SUBSTRING(sku FROM LENGTH(v_prefijo) + 2),  -- Quitar "CAJ-"
                    '^[0-9]+'  -- Extraer solo dígitos iniciales
                ) 
                AS INT
            )
        ), 
        0
    ) + 1 
    INTO v_consecutivo
    FROM producto_variantes 
    WHERE sku LIKE v_prefijo || '-%'
      AND SUBSTRING(sku FROM LENGTH(v_prefijo) + 2) ~ '^[0-9]+';  -- Solo SKUs que empiecen con números

    -- 3. Formatear (Padding con ceros a la izquierda)
    v_sku_nuevo := v_prefijo || '-' || LPAD(v_consecutivo::TEXT, 3, '0');

    RETURN v_sku_nuevo;
END;
$$;


ALTER FUNCTION public.obtener_siguiente_sku(p_categoria_id integer) OWNER TO ferram;

--
-- TOC entry 363 (class 1255 OID 25020)
-- Name: suspender_clientes_morosos(); Type: FUNCTION; Schema: public; Owner: ferram
--

CREATE FUNCTION public.suspender_clientes_morosos() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    cantidad_suspendidos INTEGER;
BEGIN
    -- Actualizamos el estado de crédito a 'SUSPENDIDO'
    UPDATE public.cliente_creditos cc
    SET estado_credito = 'SUSPENDIDO',
        ultima_actualizacion = CURRENT_TIMESTAMP
    FROM public.pedidos p
    WHERE cc.cliente_id = p.clienteid
      AND p.es_credito = true
      AND p.pagado = false
      AND p.fecha_vencimiento < (CURRENT_DATE - INTERVAL '15 days')
      AND cc.estado_credito = 'ACTIVO'; -- Solo suspendemos los que estaban activos

    GET DIAGNOSTICS cantidad_suspendidos = ROW_COUNT;
    RETURN cantidad_suspendidos;
END;
$$;


ALTER FUNCTION public.suspender_clientes_morosos() OWNER TO ferram;

--
-- TOC entry 343 (class 1255 OID 25962)
-- Name: update_inventarios_admin_timestamp(); Type: FUNCTION; Schema: public; Owner: ferram
--

CREATE FUNCTION public.update_inventarios_admin_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.ultima_actualizacion = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_inventarios_admin_timestamp() OWNER TO ferram;

--
-- TOC entry 353 (class 1255 OID 26129)
-- Name: update_landing_config_timestamp(); Type: FUNCTION; Schema: public; Owner: ferram
--

CREATE FUNCTION public.update_landing_config_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_landing_config_timestamp() OWNER TO ferram;

--
-- TOC entry 364 (class 1255 OID 25021)
-- Name: update_ultima_actualizacion(); Type: FUNCTION; Schema: public; Owner: ferram
--

CREATE FUNCTION public.update_ultima_actualizacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.ultima_actualizacion = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_ultima_actualizacion() OWNER TO ferram;

--
-- TOC entry 352 (class 1255 OID 25965)
-- Name: upsert_inventario_admin(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: ferram
--

CREATE FUNCTION public.upsert_inventario_admin(p_admin_id integer, p_variante_id integer, p_cantidad_incremento integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_nueva_cantidad INTEGER;
BEGIN
    INSERT INTO public.inventarios_admin (admin_id, variante_id, cantidad)
    VALUES (p_admin_id, p_variante_id, p_cantidad_incremento)
    ON CONFLICT (admin_id, variante_id)
    DO UPDATE SET 
        cantidad = inventarios_admin.cantidad + p_cantidad_incremento,
        ultima_actualizacion = CURRENT_TIMESTAMP
    RETURNING cantidad INTO v_nueva_cantidad;
    
    RETURN v_nueva_cantidad;
END;
$$;


ALTER FUNCTION public.upsert_inventario_admin(p_admin_id integer, p_variante_id integer, p_cantidad_incremento integer) OWNER TO ferram;

--
-- TOC entry 4957 (class 0 OID 0)
-- Dependencies: 352
-- Name: FUNCTION upsert_inventario_admin(p_admin_id integer, p_variante_id integer, p_cantidad_incremento integer); Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON FUNCTION public.upsert_inventario_admin(p_admin_id integer, p_variante_id integer, p_cantidad_incremento integer) IS 'Inserta o actualiza el stock de un admin. Incrementa la cantidad existente.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 225 (class 1259 OID 25022)
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
    apellido character(100),
    banco character varying(100),
    numero_cuenta character varying(50),
    clabe character varying(20),
    titular character varying(255)
);


ALTER TABLE public.administradores OWNER TO ferram;

--
-- TOC entry 226 (class 1259 OID 25030)
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
-- TOC entry 5017 (class 0 OID 0)
-- Dependencies: 226
-- Name: administradores_adminid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.administradores_adminid_seq OWNED BY public.administradores.adminid;


--
-- TOC entry 227 (class 1259 OID 25031)
-- Name: agentesdeventas; Type: TABLE; Schema: public; Owner: ferram
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
    adminrol text,
    banco character varying(100),
    numero_cuenta character varying(50),
    clabe character varying(20),
    titular character varying(255)
);


ALTER TABLE public.agentesdeventas OWNER TO ferram;

--
-- TOC entry 228 (class 1259 OID 25038)
-- Name: agentesdeventas_agenteid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.agentesdeventas_agenteid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.agentesdeventas_agenteid_seq OWNER TO ferram;

--
-- TOC entry 5018 (class 0 OID 0)
-- Dependencies: 228
-- Name: agentesdeventas_agenteid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.agentesdeventas_agenteid_seq OWNED BY public.agentesdeventas.agenteid;


--
-- TOC entry 229 (class 1259 OID 25039)
-- Name: carritodecompra; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.carritodecompra (
    carritoid integer NOT NULL,
    clienteid integer NOT NULL,
    fechacreacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    ultimamodificacion timestamp without time zone
);


ALTER TABLE public.carritodecompra OWNER TO ferram;

--
-- TOC entry 230 (class 1259 OID 25043)
-- Name: carritodecompra_carritoid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.carritodecompra_carritoid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.carritodecompra_carritoid_seq OWNER TO ferram;

--
-- TOC entry 5019 (class 0 OID 0)
-- Dependencies: 230
-- Name: carritodecompra_carritoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.carritodecompra_carritoid_seq OWNED BY public.carritodecompra.carritoid;


--
-- TOC entry 231 (class 1259 OID 25044)
-- Name: cat_cxp_etiquetas; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.cat_cxp_etiquetas (
    etiqueta_id integer NOT NULL,
    nombre character varying(50) NOT NULL,
    color_hex character varying(7) DEFAULT '#6c757d'::character varying,
    icono character varying(50),
    activo boolean DEFAULT true
);


ALTER TABLE public.cat_cxp_etiquetas OWNER TO ferram;

--
-- TOC entry 232 (class 1259 OID 25049)
-- Name: cat_cxp_etiquetas_etiqueta_id_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.cat_cxp_etiquetas_etiqueta_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cat_cxp_etiquetas_etiqueta_id_seq OWNER TO ferram;

--
-- TOC entry 5020 (class 0 OID 0)
-- Dependencies: 232
-- Name: cat_cxp_etiquetas_etiqueta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.cat_cxp_etiquetas_etiqueta_id_seq OWNED BY public.cat_cxp_etiquetas.etiqueta_id;


--
-- TOC entry 233 (class 1259 OID 25050)
-- Name: cat_tamanopaquetes; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.cat_tamanopaquetes (
    tamanoid integer NOT NULL,
    cantidad integer NOT NULL
);


ALTER TABLE public.cat_tamanopaquetes OWNER TO ferram;

--
-- TOC entry 234 (class 1259 OID 25053)
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
-- TOC entry 5021 (class 0 OID 0)
-- Dependencies: 234
-- Name: cat_tamanopaquetes_tamanoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.cat_tamanopaquetes_tamanoid_seq OWNED BY public.cat_tamanopaquetes.tamanoid;


--
-- TOC entry 235 (class 1259 OID 25054)
-- Name: categorias; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.categorias (
    categoriaid integer NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion text,
    parentcategoriaid integer,
    activo boolean DEFAULT true,
    imagen_url text,
    imagen_public_id character varying(255)
);


ALTER TABLE public.categorias OWNER TO ferram;

--
-- TOC entry 236 (class 1259 OID 25060)
-- Name: categorias_categoriaid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.categorias_categoriaid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.categorias_categoriaid_seq OWNER TO ferram;

--
-- TOC entry 5022 (class 0 OID 0)
-- Dependencies: 236
-- Name: categorias_categoriaid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.categorias_categoriaid_seq OWNED BY public.categorias.categoriaid;


--
-- TOC entry 237 (class 1259 OID 25061)
-- Name: cliente_creditos; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.cliente_creditos (
    credito_id integer NOT NULL,
    cliente_id integer NOT NULL,
    limite_credito numeric(15,2) DEFAULT 0.00,
    saldo_deudor numeric(15,2) DEFAULT 0.00,
    dias_gracia integer DEFAULT 15,
    estado_credito character varying(20) DEFAULT 'ACTIVO'::character varying,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    ultima_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    exportado_en timestamp without time zone,
    reporte_id character varying(50) DEFAULT NULL::character varying,
    CONSTRAINT chk_montos_positivos CHECK (((limite_credito >= (0)::numeric) AND (saldo_deudor >= (0)::numeric))),
    CONSTRAINT chk_saldo_no_excede_limite CHECK ((saldo_deudor <= limite_credito))
);


ALTER TABLE public.cliente_creditos OWNER TO ferram;

--
-- TOC entry 238 (class 1259 OID 25073)
-- Name: cliente_creditos_credito_id_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.cliente_creditos_credito_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cliente_creditos_credito_id_seq OWNER TO ferram;

--
-- TOC entry 5023 (class 0 OID 0)
-- Dependencies: 238
-- Name: cliente_creditos_credito_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.cliente_creditos_credito_id_seq OWNED BY public.cliente_creditos.credito_id;


--
-- TOC entry 239 (class 1259 OID 25074)
-- Name: cliente_direcciones; Type: TABLE; Schema: public; Owner: ferram
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


ALTER TABLE public.cliente_direcciones OWNER TO ferram;

--
-- TOC entry 240 (class 1259 OID 25079)
-- Name: cliente_direcciones_direccionid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.cliente_direcciones_direccionid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cliente_direcciones_direccionid_seq OWNER TO ferram;

--
-- TOC entry 5024 (class 0 OID 0)
-- Dependencies: 240
-- Name: cliente_direcciones_direccionid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.cliente_direcciones_direccionid_seq OWNED BY public.cliente_direcciones.direccionid;


--
-- TOC entry 241 (class 1259 OID 25080)
-- Name: clientes; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.clientes (
    clienteid integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    email character varying(255),
    passwordhash character varying(255),
    telefono character varying(20),
    fechaderegistro timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    activo boolean DEFAULT true NOT NULL,
    agenteid integer,
    google_id character varying(255),
    avatar_url text,
    CONSTRAINT chk_contacto_requerido CHECK (((email IS NOT NULL) OR (telefono IS NOT NULL)))
);


ALTER TABLE public.clientes OWNER TO ferram;

--
-- TOC entry 242 (class 1259 OID 25087)
-- Name: clientes_clienteid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.clientes_clienteid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clientes_clienteid_seq OWNER TO ferram;

--
-- TOC entry 5025 (class 0 OID 0)
-- Dependencies: 242
-- Name: clientes_clienteid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.clientes_clienteid_seq OWNED BY public.clientes.clienteid;


--
-- TOC entry 243 (class 1259 OID 25088)
-- Name: comisiones; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.comisiones (
    comisionid integer NOT NULL,
    pedidoid integer NOT NULL,
    agenteid integer NOT NULL,
    montocomision numeric(10,2) NOT NULL,
    fechacalculo timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    estatus character varying(50) DEFAULT 'Pendiente'::character varying NOT NULL
);


ALTER TABLE public.comisiones OWNER TO ferram;

--
-- TOC entry 244 (class 1259 OID 25093)
-- Name: comisiones_comisionid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.comisiones_comisionid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.comisiones_comisionid_seq OWNER TO ferram;

--
-- TOC entry 5026 (class 0 OID 0)
-- Dependencies: 244
-- Name: comisiones_comisionid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.comisiones_comisionid_seq OWNED BY public.comisiones.comisionid;


--
-- TOC entry 245 (class 1259 OID 25094)
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
    CONSTRAINT communicationlogs_estatusemail_check CHECK (((estatusemail)::text = ANY (ARRAY[('Enviado'::character varying)::text, ('Fallido'::character varying)::text])))
);


ALTER TABLE public.communicationlogs OWNER TO ferram;

--
-- TOC entry 246 (class 1259 OID 25101)
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
-- TOC entry 5027 (class 0 OID 0)
-- Dependencies: 246
-- Name: communicationlogs_logid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.communicationlogs_logid_seq OWNED BY public.communicationlogs.logid;


--
-- TOC entry 247 (class 1259 OID 25102)
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
-- TOC entry 248 (class 1259 OID 25109)
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
-- TOC entry 5028 (class 0 OID 0)
-- Dependencies: 248
-- Name: control_cambios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.control_cambios_id_seq OWNED BY public.control_cambios.id;


--
-- TOC entry 249 (class 1259 OID 25110)
-- Name: credito_movimientos; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.credito_movimientos (
    movimiento_id integer NOT NULL,
    credito_id integer NOT NULL,
    tipo_movimiento character varying(20) NOT NULL,
    monto numeric(15,2) NOT NULL,
    referencia_id character varying(50),
    descripcion text,
    fecha_movimiento timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    saldo_despues_movimiento numeric(15,2) NOT NULL,
    registrado_por integer,
    admin_id integer,
    agente_id integer
);


ALTER TABLE public.credito_movimientos OWNER TO ferram;

--
-- TOC entry 250 (class 1259 OID 25116)
-- Name: credito_movimientos_movimiento_id_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.credito_movimientos_movimiento_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.credito_movimientos_movimiento_id_seq OWNER TO ferram;

--
-- TOC entry 5029 (class 0 OID 0)
-- Dependencies: 250
-- Name: credito_movimientos_movimiento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.credito_movimientos_movimiento_id_seq OWNED BY public.credito_movimientos.movimiento_id;


--
-- TOC entry 251 (class 1259 OID 25117)
-- Name: cuentas_por_cobrar; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.cuentas_por_cobrar (
    cxcid integer NOT NULL,
    pedido_id integer,
    cliente_id integer,
    tipo_movimiento character varying(10),
    monto numeric(10,2) NOT NULL,
    descripcion character varying(255),
    fecha_movimiento timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.cuentas_por_cobrar OWNER TO ferram;

--
-- TOC entry 252 (class 1259 OID 25121)
-- Name: cuentas_por_cobrar_cxcid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.cuentas_por_cobrar_cxcid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cuentas_por_cobrar_cxcid_seq OWNER TO ferram;

--
-- TOC entry 5030 (class 0 OID 0)
-- Dependencies: 252
-- Name: cuentas_por_cobrar_cxcid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.cuentas_por_cobrar_cxcid_seq OWNED BY public.cuentas_por_cobrar.cxcid;


--
-- TOC entry 253 (class 1259 OID 25122)
-- Name: cuentas_por_pagar; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.cuentas_por_pagar (
    cxp_id integer NOT NULL,
    proveedor_id integer NOT NULL,
    orden_compra_id integer,
    fecha_emision timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_vencimiento date,
    monto_total numeric(12,2) NOT NULL,
    monto_pagado numeric(12,2) DEFAULT 0.00,
    estatus public.estatus_cxp_enum DEFAULT 'PENDIENTE'::public.estatus_cxp_enum,
    referencia_factura character varying(100),
    comprobante_pago text,
    notas text,
    usuario_creador_id integer,
    monto_original numeric(12,2),
    fecha_cierre timestamp without time zone,
    exportado_en timestamp without time zone,
    reporte_id character varying(50) DEFAULT NULL::character varying,
    CONSTRAINT chk_monto_pagado_positivo CHECK ((monto_pagado >= (0)::numeric)),
    CONSTRAINT chk_monto_total_positivo CHECK ((monto_total >= (0)::numeric)),
    CONSTRAINT chk_pago_no_excede_total CHECK ((monto_pagado <= monto_total))
);


ALTER TABLE public.cuentas_por_pagar OWNER TO ferram;

--
-- TOC entry 254 (class 1259 OID 25134)
-- Name: cuentas_por_pagar_cxp_id_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.cuentas_por_pagar_cxp_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cuentas_por_pagar_cxp_id_seq OWNER TO ferram;

--
-- TOC entry 5031 (class 0 OID 0)
-- Dependencies: 254
-- Name: cuentas_por_pagar_cxp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.cuentas_por_pagar_cxp_id_seq OWNED BY public.cuentas_por_pagar.cxp_id;


--
-- TOC entry 313 (class 1259 OID 25893)
-- Name: cupones; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.cupones (
    cuponid integer NOT NULL,
    codigo character varying(20) NOT NULL,
    descripcion text,
    tipo_descuento character varying(20) DEFAULT 'PORCENTAJE'::character varying,
    valor numeric(10,2) NOT NULL,
    fecha_inicio timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_fin timestamp without time zone,
    uso_maximo integer,
    usos_actuales integer DEFAULT 0,
    activo boolean DEFAULT true,
    monto_minimo_compra numeric(10,2) DEFAULT 0.00,
    agente_id integer
);


ALTER TABLE public.cupones OWNER TO ferram;

--
-- TOC entry 5032 (class 0 OID 0)
-- Dependencies: 313
-- Name: COLUMN cupones.agente_id; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.cupones.agente_id IS 'ID del agente que generó o es dueño de este cupón';


--
-- TOC entry 312 (class 1259 OID 25892)
-- Name: cupones_cuponid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.cupones_cuponid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cupones_cuponid_seq OWNER TO ferram;

--
-- TOC entry 5033 (class 0 OID 0)
-- Dependencies: 312
-- Name: cupones_cuponid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.cupones_cuponid_seq OWNED BY public.cupones.cuponid;


--
-- TOC entry 255 (class 1259 OID 25135)
-- Name: cxp_etiquetas_asignadas; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.cxp_etiquetas_asignadas (
    asignacion_id integer NOT NULL,
    cxp_id integer NOT NULL,
    etiqueta_id integer NOT NULL,
    fecha_asignacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.cxp_etiquetas_asignadas OWNER TO ferram;

--
-- TOC entry 256 (class 1259 OID 25139)
-- Name: cxp_etiquetas_asignadas_asignacion_id_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.cxp_etiquetas_asignadas_asignacion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cxp_etiquetas_asignadas_asignacion_id_seq OWNER TO ferram;

--
-- TOC entry 5034 (class 0 OID 0)
-- Dependencies: 256
-- Name: cxp_etiquetas_asignadas_asignacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.cxp_etiquetas_asignadas_asignacion_id_seq OWNED BY public.cxp_etiquetas_asignadas.asignacion_id;


--
-- TOC entry 257 (class 1259 OID 25140)
-- Name: datos_bancarios_empresa; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.datos_bancarios_empresa (
    id integer NOT NULL,
    banco character varying(100) NOT NULL,
    numero_cuenta character varying(50) NOT NULL,
    clabe character varying(20),
    titular character varying(255) NOT NULL,
    ultima_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    es_principal boolean DEFAULT false
);


ALTER TABLE public.datos_bancarios_empresa OWNER TO ferram;

--
-- TOC entry 258 (class 1259 OID 25145)
-- Name: datos_bancarios_empresa_id_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.datos_bancarios_empresa_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.datos_bancarios_empresa_id_seq OWNER TO ferram;

--
-- TOC entry 5035 (class 0 OID 0)
-- Dependencies: 258
-- Name: datos_bancarios_empresa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.datos_bancarios_empresa_id_seq OWNED BY public.datos_bancarios_empresa.id;


--
-- TOC entry 259 (class 1259 OID 25146)
-- Name: detallesdelpedido; Type: TABLE; Schema: public; Owner: ferram
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


ALTER TABLE public.detallesdelpedido OWNER TO ferram;

--
-- TOC entry 260 (class 1259 OID 25152)
-- Name: detallesdelpedido_detalleid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.detallesdelpedido_detalleid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.detallesdelpedido_detalleid_seq OWNER TO ferram;

--
-- TOC entry 5036 (class 0 OID 0)
-- Dependencies: 260
-- Name: detallesdelpedido_detalleid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.detallesdelpedido_detalleid_seq OWNED BY public.detallesdelpedido.detalleid;


--
-- TOC entry 261 (class 1259 OID 25153)
-- Name: detallesordencompra; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.detallesordencompra (
    detalleoc_id integer NOT NULL,
    ordencompraid integer NOT NULL,
    varianteid integer NOT NULL,
    cantidadsolicitada integer NOT NULL,
    cantidadrecibida integer DEFAULT 0 NOT NULL,
    piezasporpaquete integer DEFAULT 1,
    costounitario numeric(10,2) DEFAULT 0.00 NOT NULL,
    piezasrecibidas integer DEFAULT 0 NOT NULL,
    CONSTRAINT detallesordencompra_costounitario_chk CHECK ((costounitario >= (0)::numeric))
);


ALTER TABLE public.detallesordencompra OWNER TO ferram;

--
-- TOC entry 262 (class 1259 OID 25161)
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
-- TOC entry 5037 (class 0 OID 0)
-- Dependencies: 262
-- Name: detallesordencompra_detalleoc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.detallesordencompra_detalleoc_id_seq OWNED BY public.detallesordencompra.detalleoc_id;


--
-- TOC entry 321 (class 1259 OID 26155)
-- Name: developers; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.developers (
    dev_id integer NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.developers OWNER TO ferram;

--
-- TOC entry 320 (class 1259 OID 26154)
-- Name: developers_dev_id_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.developers_dev_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.developers_dev_id_seq OWNER TO ferram;

--
-- TOC entry 5038 (class 0 OID 0)
-- Dependencies: 320
-- Name: developers_dev_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.developers_dev_id_seq OWNED BY public.developers.dev_id;


--
-- TOC entry 263 (class 1259 OID 25162)
-- Name: notificaciones; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.notificaciones (
    notificacionid integer NOT NULL,
    clienteid integer,
    tipo character varying(50) NOT NULL,
    titulo character varying(200) NOT NULL,
    mensaje text NOT NULL,
    leida boolean DEFAULT false,
    fechacreacion timestamp without time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    url character varying(500),
    prioridad character varying(20) DEFAULT 'normal'::character varying,
    administrador_id integer,
    agente_id integer,
    CONSTRAINT check_destinatario CHECK ((((((clienteid IS NOT NULL))::integer + ((administrador_id IS NOT NULL))::integer) + ((agente_id IS NOT NULL))::integer) = 1)),
    CONSTRAINT notificaciones_prioridad_check CHECK (((prioridad)::text = ANY (ARRAY[('baja'::character varying)::text, ('normal'::character varying)::text, ('alta'::character varying)::text, ('urgente'::character varying)::text]))),
    CONSTRAINT notificaciones_tipo_check CHECK (((tipo)::text = ANY (ARRAY[('pedido'::character varying)::text, ('oferta'::character varying)::text, ('temporada'::character varying)::text, ('backorder'::character varying)::text, ('sistema'::character varying)::text, ('producto'::character varying)::text])))
);


ALTER TABLE public.notificaciones OWNER TO ferram;

--
-- TOC entry 5039 (class 0 OID 0)
-- Dependencies: 263
-- Name: TABLE notificaciones; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.notificaciones IS 'Notificaciones para clientes del sistema';


--
-- TOC entry 5040 (class 0 OID 0)
-- Dependencies: 263
-- Name: COLUMN notificaciones.tipo; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.notificaciones.tipo IS 'Tipo de notificación: pedido, oferta, temporada, backorder, sistema, producto';


--
-- TOC entry 5041 (class 0 OID 0)
-- Dependencies: 263
-- Name: COLUMN notificaciones.metadata; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.notificaciones.metadata IS 'Información adicional en formato JSON (ej: pedidoId, productoId, etc)';


--
-- TOC entry 5042 (class 0 OID 0)
-- Dependencies: 263
-- Name: COLUMN notificaciones.url; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.notificaciones.url IS 'URL de redirección al hacer click en la notificación';


--
-- TOC entry 5043 (class 0 OID 0)
-- Dependencies: 263
-- Name: COLUMN notificaciones.prioridad; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.notificaciones.prioridad IS 'Prioridad de la notificación: baja, normal, alta, urgente';


--
-- TOC entry 264 (class 1259 OID 25174)
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
-- TOC entry 5044 (class 0 OID 0)
-- Dependencies: 264
-- Name: VIEW estadisticas_notificaciones; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON VIEW public.estadisticas_notificaciones IS 'Estadísticas de notificaciones por cliente';


--
-- TOC entry 265 (class 1259 OID 25179)
-- Name: estados; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.estados (
    estadoid integer NOT NULL,
    nombre character varying(100) NOT NULL,
    abreviatura character varying(10) NOT NULL
);


ALTER TABLE public.estados OWNER TO ferram;

--
-- TOC entry 266 (class 1259 OID 25182)
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
-- TOC entry 5045 (class 0 OID 0)
-- Dependencies: 266
-- Name: estados_estadoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.estados_estadoid_seq OWNED BY public.estados.estadoid;


--
-- TOC entry 315 (class 1259 OID 25938)
-- Name: inventarios_admin; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.inventarios_admin (
    inventario_id integer NOT NULL,
    admin_id integer NOT NULL,
    variante_id integer NOT NULL,
    cantidad integer DEFAULT 0 NOT NULL,
    ultima_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    registrado_por integer,
    CONSTRAINT chk_cantidad_no_negativa CHECK ((cantidad >= 0))
);


ALTER TABLE public.inventarios_admin OWNER TO ferram;

--
-- TOC entry 5046 (class 0 OID 0)
-- Dependencies: 315
-- Name: TABLE inventarios_admin; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.inventarios_admin IS 'Tabla de inventario segregado por administrador. Cada admin tiene su propio stock independiente.';


--
-- TOC entry 5047 (class 0 OID 0)
-- Dependencies: 315
-- Name: COLUMN inventarios_admin.admin_id; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.inventarios_admin.admin_id IS 'ID del administrador dueño del stock';


--
-- TOC entry 5048 (class 0 OID 0)
-- Dependencies: 315
-- Name: COLUMN inventarios_admin.variante_id; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.inventarios_admin.variante_id IS 'ID de la variante de producto';


--
-- TOC entry 5049 (class 0 OID 0)
-- Dependencies: 315
-- Name: COLUMN inventarios_admin.cantidad; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.inventarios_admin.cantidad IS 'Cantidad de piezas disponibles para este admin';


--
-- TOC entry 5050 (class 0 OID 0)
-- Dependencies: 315
-- Name: COLUMN inventarios_admin.ultima_actualizacion; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.inventarios_admin.ultima_actualizacion IS 'Timestamp de última modificación del stock';


--
-- TOC entry 5051 (class 0 OID 0)
-- Dependencies: 315
-- Name: COLUMN inventarios_admin.registrado_por; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.inventarios_admin.registrado_por IS 'ID del administrador que registró esta entrada de inventario';


--
-- TOC entry 314 (class 1259 OID 25937)
-- Name: inventarios_admin_inventario_id_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.inventarios_admin_inventario_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventarios_admin_inventario_id_seq OWNER TO ferram;

--
-- TOC entry 5052 (class 0 OID 0)
-- Dependencies: 314
-- Name: inventarios_admin_inventario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.inventarios_admin_inventario_id_seq OWNED BY public.inventarios_admin.inventario_id;


--
-- TOC entry 267 (class 1259 OID 25183)
-- Name: itemsdelcarrito; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.itemsdelcarrito (
    itemid integer NOT NULL,
    carritoid integer NOT NULL,
    varianteid integer NOT NULL,
    cantidadpaquetes integer NOT NULL,
    tamanoid integer,
    cantidad integer
);


ALTER TABLE public.itemsdelcarrito OWNER TO ferram;

--
-- TOC entry 268 (class 1259 OID 25186)
-- Name: itemsdelcarrito_itemid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.itemsdelcarrito_itemid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.itemsdelcarrito_itemid_seq OWNER TO ferram;

--
-- TOC entry 5053 (class 0 OID 0)
-- Dependencies: 268
-- Name: itemsdelcarrito_itemid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.itemsdelcarrito_itemid_seq OWNED BY public.itemsdelcarrito.itemid;


--
-- TOC entry 317 (class 1259 OID 26114)
-- Name: landing_page_config; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.landing_page_config (
    config_id integer NOT NULL,
    section_key character varying(100) NOT NULL,
    content_type character varying(50) NOT NULL,
    value_draft text,
    value_published text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT landing_page_config_content_type_check CHECK (((content_type)::text = ANY ((ARRAY['image_url'::character varying, 'category_id'::character varying, 'text'::character varying, 'json'::character varying])::text[])))
);


ALTER TABLE public.landing_page_config OWNER TO ferram;

--
-- TOC entry 5054 (class 0 OID 0)
-- Dependencies: 317
-- Name: TABLE landing_page_config; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.landing_page_config IS 'Stores dynamic content configuration for the landing page with draft/publish workflow';


--
-- TOC entry 5055 (class 0 OID 0)
-- Dependencies: 317
-- Name: COLUMN landing_page_config.section_key; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.landing_page_config.section_key IS 'Unique identifier for the content section (e.g., hero_slide_1_image)';


--
-- TOC entry 5056 (class 0 OID 0)
-- Dependencies: 317
-- Name: COLUMN landing_page_config.content_type; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.landing_page_config.content_type IS 'Type of content: image_url, category_id, text, json';


--
-- TOC entry 5057 (class 0 OID 0)
-- Dependencies: 317
-- Name: COLUMN landing_page_config.value_draft; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.landing_page_config.value_draft IS 'Draft value (not visible to public users)';


--
-- TOC entry 5058 (class 0 OID 0)
-- Dependencies: 317
-- Name: COLUMN landing_page_config.value_published; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.landing_page_config.value_published IS 'Published value (visible to all users)';


--
-- TOC entry 5059 (class 0 OID 0)
-- Dependencies: 317
-- Name: COLUMN landing_page_config.metadata; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.landing_page_config.metadata IS 'Additional metadata (order, labels, etc.)';


--
-- TOC entry 316 (class 1259 OID 26113)
-- Name: landing_page_config_config_id_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.landing_page_config_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.landing_page_config_config_id_seq OWNER TO ferram;

--
-- TOC entry 5060 (class 0 OID 0)
-- Dependencies: 316
-- Name: landing_page_config_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.landing_page_config_config_id_seq OWNED BY public.landing_page_config.config_id;


--
-- TOC entry 269 (class 1259 OID 25187)
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
-- TOC entry 270 (class 1259 OID 25193)
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
-- TOC entry 5061 (class 0 OID 0)
-- Dependencies: 270
-- Name: log_eventosusuario_eventoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.log_eventosusuario_eventoid_seq OWNED BY public.log_eventosusuario.eventoid;


--
-- TOC entry 271 (class 1259 OID 25194)
-- Name: log_inventario; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.log_inventario (
    logid integer NOT NULL,
    varianteid integer NOT NULL,
    fecha timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    cantidadcambiado integer NOT NULL,
    nuevostock integer NOT NULL,
    motivo character varying(255),
    usuarioid integer,
    es_excepcion boolean DEFAULT false,
    cxp_id integer
);


ALTER TABLE public.log_inventario OWNER TO ferram;

--
-- TOC entry 272 (class 1259 OID 25199)
-- Name: log_inventario_logid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.log_inventario_logid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.log_inventario_logid_seq OWNER TO ferram;

--
-- TOC entry 5062 (class 0 OID 0)
-- Dependencies: 272
-- Name: log_inventario_logid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.log_inventario_logid_seq OWNED BY public.log_inventario.logid;


--
-- TOC entry 273 (class 1259 OID 25200)
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
    CONSTRAINT log_movimientos_accion_check CHECK (((accion)::text = ANY (ARRAY[('CREAR'::character varying)::text, ('EDITAR'::character varying)::text, ('ELIMINAR'::character varying)::text, ('LOGIN'::character varying)::text, ('OTRO'::character varying)::text])))
);


ALTER TABLE public.log_movimientos OWNER TO ferram;

--
-- TOC entry 274 (class 1259 OID 25207)
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
-- TOC entry 5063 (class 0 OID 0)
-- Dependencies: 274
-- Name: log_movimientos_logid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.log_movimientos_logid_seq OWNED BY public.log_movimientos.logid;


--
-- TOC entry 275 (class 1259 OID 25208)
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
-- TOC entry 5064 (class 0 OID 0)
-- Dependencies: 275
-- Name: TABLE medidas; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.medidas IS 'Medidas específicas para cada tipo de producto';


--
-- TOC entry 276 (class 1259 OID 25215)
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
-- TOC entry 5065 (class 0 OID 0)
-- Dependencies: 276
-- Name: medidas_medidaid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.medidas_medidaid_seq OWNED BY public.medidas.medidaid;


--
-- TOC entry 277 (class 1259 OID 25216)
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
-- TOC entry 5066 (class 0 OID 0)
-- Dependencies: 277
-- Name: notificaciones_notificacionid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.notificaciones_notificacionid_seq OWNED BY public.notificaciones.notificacionid;


--
-- TOC entry 278 (class 1259 OID 25217)
-- Name: ordenesdecompra; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.ordenesdecompra (
    ordencompraid integer NOT NULL,
    proveedorid integer NOT NULL,
    fechacreacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fechaentregaesperada date,
    estatus character varying(50) DEFAULT 'Pendiente'::character varying NOT NULL,
    origenoc character varying(20) DEFAULT 'manual'::character varying,
    fechasolicitud timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    total numeric(12,2) DEFAULT 0.00 NOT NULL,
    usuario_creador_id integer,
    exportado_en timestamp without time zone,
    reporte_id character varying(50) DEFAULT NULL::character varying
);


ALTER TABLE public.ordenesdecompra OWNER TO ferram;

--
-- TOC entry 5067 (class 0 OID 0)
-- Dependencies: 278
-- Name: COLUMN ordenesdecompra.origenoc; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.ordenesdecompra.origenoc IS 'Origen de la orden: manual, backorder';


--
-- TOC entry 279 (class 1259 OID 25226)
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
-- TOC entry 5068 (class 0 OID 0)
-- Dependencies: 279
-- Name: ordenesdecompra_ordencompraid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.ordenesdecompra_ordencompraid_seq OWNED BY public.ordenesdecompra.ordencompraid;


--
-- TOC entry 280 (class 1259 OID 25227)
-- Name: pagos_clientes; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.pagos_clientes (
    pago_id integer NOT NULL,
    cliente_id integer NOT NULL,
    credito_id integer,
    monto numeric(15,2) NOT NULL,
    tipo_pago character varying(30) DEFAULT 'TRANSFERENCIA'::character varying NOT NULL,
    estatus character varying(20) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    comprobante_url text,
    referencia_bancaria character varying(100),
    transaccion_id character varying(100),
    fecha_pago timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_validacion timestamp without time zone,
    validado_por integer,
    notas text,
    movimientos_aplicados jsonb,
    CONSTRAINT chk_estatus_pago CHECK (((estatus)::text = ANY (ARRAY[('PENDIENTE'::character varying)::text, ('APROBADO'::character varying)::text, ('RECHAZADO'::character varying)::text]))),
    CONSTRAINT chk_tipo_pago CHECK (((tipo_pago)::text = ANY (ARRAY[('TRANSFERENCIA'::character varying)::text, ('MERCADOPAGO'::character varying)::text, ('EFECTIVO'::character varying)::text, ('CHEQUE'::character varying)::text, ('OTRO'::character varying)::text]))),
    CONSTRAINT pagos_clientes_monto_check CHECK ((monto > (0)::numeric))
);


ALTER TABLE public.pagos_clientes OWNER TO ferram;

--
-- TOC entry 5069 (class 0 OID 0)
-- Dependencies: 280
-- Name: TABLE pagos_clientes; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.pagos_clientes IS 'Registro de pagos realizados por clientes para liquidar su crédito';


--
-- TOC entry 5070 (class 0 OID 0)
-- Dependencies: 280
-- Name: COLUMN pagos_clientes.tipo_pago; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.pagos_clientes.tipo_pago IS 'Método de pago utilizado por el cliente';


--
-- TOC entry 5071 (class 0 OID 0)
-- Dependencies: 280
-- Name: COLUMN pagos_clientes.estatus; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.pagos_clientes.estatus IS 'PENDIENTE: En revisión | APROBADO: Validado y aplicado | RECHAZADO: No válido';


--
-- TOC entry 5072 (class 0 OID 0)
-- Dependencies: 280
-- Name: COLUMN pagos_clientes.movimientos_aplicados; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.pagos_clientes.movimientos_aplicados IS 'JSON con IDs de movimientos de crédito a los que se aplicó este pago';


--
-- TOC entry 281 (class 1259 OID 25238)
-- Name: pagos_clientes_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.pagos_clientes_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pagos_clientes_pago_id_seq OWNER TO ferram;

--
-- TOC entry 5073 (class 0 OID 0)
-- Dependencies: 281
-- Name: pagos_clientes_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.pagos_clientes_pago_id_seq OWNED BY public.pagos_clientes.pago_id;


--
-- TOC entry 282 (class 1259 OID 25239)
-- Name: pagos_cxp; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.pagos_cxp (
    pago_id integer NOT NULL,
    cxp_id integer NOT NULL,
    fecha_pago timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    monto numeric(12,2) NOT NULL,
    metodo_pago character varying(50),
    referencia_bancaria character varying(100),
    comprobante_url text,
    nota text,
    usuario_id integer,
    CONSTRAINT pagos_cxp_monto_check CHECK ((monto > (0)::numeric))
);


ALTER TABLE public.pagos_cxp OWNER TO ferram;

--
-- TOC entry 283 (class 1259 OID 25246)
-- Name: pagos_cxp_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.pagos_cxp_pago_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pagos_cxp_pago_id_seq OWNER TO ferram;

--
-- TOC entry 5074 (class 0 OID 0)
-- Dependencies: 283
-- Name: pagos_cxp_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.pagos_cxp_pago_id_seq OWNED BY public.pagos_cxp.pago_id;


--
-- TOC entry 284 (class 1259 OID 25247)
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
-- TOC entry 285 (class 1259 OID 25251)
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
-- TOC entry 5075 (class 0 OID 0)
-- Dependencies: 285
-- Name: passwordresettokens_tokenid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.passwordresettokens_tokenid_seq OWNED BY public.passwordresettokens.tokenid;


--
-- TOC entry 286 (class 1259 OID 25252)
-- Name: pedidos; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.pedidos (
    pedidoid integer NOT NULL,
    clienteid integer NOT NULL,
    agenteid integer,
    direccionenvioid integer NOT NULL,
    fechapedido timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    montototal numeric(10,2) NOT NULL,
    estatus character varying(50) DEFAULT 'Pendiente'::character varying NOT NULL,
    costoenvio numeric(10,2) DEFAULT 0.00 NOT NULL,
    es_credito boolean DEFAULT false,
    fecha_vencimiento timestamp without time zone,
    pagado boolean DEFAULT false,
    transaccion_id character varying(100),
    comprobante_url text,
    metodo_pago character varying(30),
    cupon_id integer,
    monto_descuento numeric(10,2) DEFAULT 0.00,
    saldo_pendiente numeric(10,2) DEFAULT 0.00,
    url_evidencia_entrega text,
    fecha_entrega_real timestamp without time zone
);


ALTER TABLE public.pedidos OWNER TO ferram;

--
-- TOC entry 5076 (class 0 OID 0)
-- Dependencies: 286
-- Name: COLUMN pedidos.url_evidencia_entrega; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.pedidos.url_evidencia_entrega IS 'URL de la foto de la remisión firmada por el cliente (Cloudinary)';


--
-- TOC entry 5077 (class 0 OID 0)
-- Dependencies: 286
-- Name: COLUMN pedidos.fecha_entrega_real; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.pedidos.fecha_entrega_real IS 'Fecha y hora real en que se entregó el pedido y se subió la evidencia';


--
-- TOC entry 287 (class 1259 OID 25262)
-- Name: pedidos_pedidoid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.pedidos_pedidoid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pedidos_pedidoid_seq OWNER TO ferram;

--
-- TOC entry 5078 (class 0 OID 0)
-- Dependencies: 287
-- Name: pedidos_pedidoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.pedidos_pedidoid_seq OWNED BY public.pedidos.pedidoid;


--
-- TOC entry 288 (class 1259 OID 25263)
-- Name: producto_imagenes; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.producto_imagenes (
    imagenid integer NOT NULL,
    url_imagen character varying(1024) NOT NULL,
    textoalternativo character varying(255),
    orden integer DEFAULT 0,
    productoid integer
);


ALTER TABLE public.producto_imagenes OWNER TO ferram;

--
-- TOC entry 311 (class 1259 OID 25877)
-- Name: producto_imagenes_color; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.producto_imagenes_color (
    imagencolorid integer NOT NULL,
    productoid integer NOT NULL,
    color_nombre character varying(100) NOT NULL,
    url_imagen_cloudinary text NOT NULL,
    public_id_cloudinary character varying(100),
    fechacreacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.producto_imagenes_color OWNER TO ferram;

--
-- TOC entry 310 (class 1259 OID 25876)
-- Name: producto_imagenes_color_imagencolorid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.producto_imagenes_color_imagencolorid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.producto_imagenes_color_imagencolorid_seq OWNER TO ferram;

--
-- TOC entry 5079 (class 0 OID 0)
-- Dependencies: 310
-- Name: producto_imagenes_color_imagencolorid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.producto_imagenes_color_imagencolorid_seq OWNED BY public.producto_imagenes_color.imagencolorid;


--
-- TOC entry 289 (class 1259 OID 25269)
-- Name: producto_imagenes_imagenid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.producto_imagenes_imagenid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.producto_imagenes_imagenid_seq OWNER TO ferram;

--
-- TOC entry 5080 (class 0 OID 0)
-- Dependencies: 289
-- Name: producto_imagenes_imagenid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.producto_imagenes_imagenid_seq OWNED BY public.producto_imagenes.imagenid;


--
-- TOC entry 290 (class 1259 OID 25270)
-- Name: producto_tamanosdisponibles; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.producto_tamanosdisponibles (
    productoid integer NOT NULL,
    tamanoid integer NOT NULL
);


ALTER TABLE public.producto_tamanosdisponibles OWNER TO ferram;

--
-- TOC entry 291 (class 1259 OID 25273)
-- Name: producto_variante_imagenes; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.producto_variante_imagenes (
    imagenid integer NOT NULL,
    url_imagen character varying(1024) NOT NULL,
    textoalternativo character varying(255),
    orden integer DEFAULT 0,
    varianteid integer NOT NULL
);


ALTER TABLE public.producto_variante_imagenes OWNER TO ferram;

--
-- TOC entry 292 (class 1259 OID 25279)
-- Name: producto_variante_imagenes_imagenid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.producto_variante_imagenes_imagenid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.producto_variante_imagenes_imagenid_seq OWNER TO ferram;

--
-- TOC entry 5081 (class 0 OID 0)
-- Dependencies: 292
-- Name: producto_variante_imagenes_imagenid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.producto_variante_imagenes_imagenid_seq OWNED BY public.producto_variante_imagenes.imagenid;


--
-- TOC entry 293 (class 1259 OID 25280)
-- Name: producto_variantes; Type: TABLE; Schema: public; Owner: ferram
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
    piezasporpaquete integer DEFAULT 1,
    stock_minimo integer DEFAULT 0 NOT NULL,
    color_nombre character varying(100) DEFAULT NULL::character varying,
    color_hex character varying(20) DEFAULT NULL::character varying
);


ALTER TABLE public.producto_variantes OWNER TO ferram;

--
-- TOC entry 5082 (class 0 OID 0)
-- Dependencies: 293
-- Name: COLUMN producto_variantes.stock; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.producto_variantes.stock IS 'COLUMNA LEGACY - No usar. El stock real está en inventarios_admin segregado por administrador.';


--
-- TOC entry 5083 (class 0 OID 0)
-- Dependencies: 293
-- Name: COLUMN producto_variantes.tipoproductoid; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.producto_variantes.tipoproductoid IS 'Formato físico del producto (Caja, Bolsa, etc.)';


--
-- TOC entry 294 (class 1259 OID 25292)
-- Name: producto_variantes_varianteid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.producto_variantes_varianteid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.producto_variantes_varianteid_seq OWNER TO ferram;

--
-- TOC entry 5084 (class 0 OID 0)
-- Dependencies: 294
-- Name: producto_variantes_varianteid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.producto_variantes_varianteid_seq OWNED BY public.producto_variantes.varianteid;


--
-- TOC entry 295 (class 1259 OID 25293)
-- Name: productos; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.productos (
    productoid integer NOT NULL,
    categoriaid integer NOT NULL,
    nombreproducto character varying(255) NOT NULL,
    descripcion text,
    activo boolean DEFAULT true,
    proveedorid_default integer,
    sku_maestro character varying(20),
    reglaid integer,
    created_by_admin_id integer
);


ALTER TABLE public.productos OWNER TO ferram;

--
-- TOC entry 296 (class 1259 OID 25299)
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
-- TOC entry 5085 (class 0 OID 0)
-- Dependencies: 296
-- Name: productos_productoid_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.productos_productoid_seq1 OWNED BY public.productos.productoid;


--
-- TOC entry 297 (class 1259 OID 25300)
-- Name: proveedor_reglas_empaque; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.proveedor_reglas_empaque (
    reglaid integer NOT NULL,
    proveedorid integer NOT NULL,
    tipoproductoid integer NOT NULL,
    cantidadempaque integer DEFAULT 1,
    descripcion character varying(100),
    nombre_regla character varying(120)
);


ALTER TABLE public.proveedor_reglas_empaque OWNER TO ferram;

--
-- TOC entry 298 (class 1259 OID 25304)
-- Name: proveedor_reglas_empaque_reglaid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.proveedor_reglas_empaque_reglaid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.proveedor_reglas_empaque_reglaid_seq OWNER TO ferram;

--
-- TOC entry 5086 (class 0 OID 0)
-- Dependencies: 298
-- Name: proveedor_reglas_empaque_reglaid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.proveedor_reglas_empaque_reglaid_seq OWNED BY public.proveedor_reglas_empaque.reglaid;


--
-- TOC entry 299 (class 1259 OID 25305)
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
-- TOC entry 300 (class 1259 OID 25310)
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
-- TOC entry 5087 (class 0 OID 0)
-- Dependencies: 300
-- Name: proveedores_proveedorid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.proveedores_proveedorid_seq OWNED BY public.proveedores.proveedorid;


--
-- TOC entry 301 (class 1259 OID 25311)
-- Name: solicitudes_credito; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.solicitudes_credito (
    solicitud_id integer NOT NULL,
    cliente_id integer NOT NULL,
    monto_solicitado numeric(15,2) NOT NULL,
    motivo_uso text,
    estado character varying(20) DEFAULT 'PENDIENTE'::character varying,
    fecha_solicitud timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    comentarios_admin text
);


ALTER TABLE public.solicitudes_credito OWNER TO ferram;

--
-- TOC entry 302 (class 1259 OID 25318)
-- Name: solicitudes_credito_solicitud_id_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.solicitudes_credito_solicitud_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.solicitudes_credito_solicitud_id_seq OWNER TO ferram;

--
-- TOC entry 5088 (class 0 OID 0)
-- Dependencies: 302
-- Name: solicitudes_credito_solicitud_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.solicitudes_credito_solicitud_id_seq OWNED BY public.solicitudes_credito.solicitud_id;


--
-- TOC entry 319 (class 1259 OID 26144)
-- Name: tenants; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.tenants (
    tenant_id integer NOT NULL,
    nombre_cliente character varying(100) NOT NULL,
    dominio character varying(100),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tenants OWNER TO ferram;

--
-- TOC entry 318 (class 1259 OID 26143)
-- Name: tenants_tenant_id_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.tenants_tenant_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tenants_tenant_id_seq OWNER TO ferram;

--
-- TOC entry 5089 (class 0 OID 0)
-- Dependencies: 318
-- Name: tenants_tenant_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.tenants_tenant_id_seq OWNED BY public.tenants.tenant_id;


--
-- TOC entry 303 (class 1259 OID 25319)
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
-- TOC entry 5090 (class 0 OID 0)
-- Dependencies: 303
-- Name: TABLE tipoproducto; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.tipoproducto IS 'Define el tipo físico del producto (Caja, Bolsa, Peluche, etc.)';


--
-- TOC entry 304 (class 1259 OID 25326)
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
-- TOC entry 5091 (class 0 OID 0)
-- Dependencies: 304
-- Name: tipoproducto_tipoproductoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.tipoproducto_tipoproductoid_seq OWNED BY public.tipoproducto.tipoproductoid;


--
-- TOC entry 305 (class 1259 OID 25327)
-- Name: toma_inventario_conteos; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.toma_inventario_conteos (
    conteoid integer NOT NULL,
    sesionid integer NOT NULL,
    varianteid integer NOT NULL,
    conteo_a integer,
    usuario_a_id integer,
    conteo_b integer,
    usuario_b_id integer,
    cantidad_final integer,
    estatus_fila public.estatus_conteo_enum DEFAULT 'PENDIENTE_A'::public.estatus_conteo_enum NOT NULL,
    estatus_aplicacion public.estatus_aplicacion_enum DEFAULT 'PENDIENTE'::public.estatus_aplicacion_enum,
    CONSTRAINT chk_usuarios_auditoria CHECK ((((conteo_a IS NULL) AND (usuario_a_id IS NULL)) OR ((conteo_a IS NOT NULL) AND (usuario_a_id IS NOT NULL))))
);


ALTER TABLE public.toma_inventario_conteos OWNER TO ferram;

--
-- TOC entry 5092 (class 0 OID 0)
-- Dependencies: 305
-- Name: TABLE toma_inventario_conteos; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.toma_inventario_conteos IS 'Registros individuales de conteo doble ciego. Requiere coincidencia de A y B para validar.';


--
-- TOC entry 5093 (class 0 OID 0)
-- Dependencies: 305
-- Name: COLUMN toma_inventario_conteos.estatus_aplicacion; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.toma_inventario_conteos.estatus_aplicacion IS 'Estado de aplicación del conteo al inventario: PENDIENTE (no procesado), APLICADO (stock actualizado), NO_APLICADO (conflicto/pendiente ignorado)';


--
-- TOC entry 306 (class 1259 OID 25333)
-- Name: toma_inventario_conteos_conteoid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.toma_inventario_conteos_conteoid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.toma_inventario_conteos_conteoid_seq OWNER TO ferram;

--
-- TOC entry 5094 (class 0 OID 0)
-- Dependencies: 306
-- Name: toma_inventario_conteos_conteoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.toma_inventario_conteos_conteoid_seq OWNED BY public.toma_inventario_conteos.conteoid;


--
-- TOC entry 307 (class 1259 OID 25334)
-- Name: toma_inventario_sesiones; Type: TABLE; Schema: public; Owner: ferram
--

CREATE TABLE public.toma_inventario_sesiones (
    sesionid integer NOT NULL,
    nombre character varying(150) NOT NULL,
    fechainicio timestamp without time zone DEFAULT now(),
    fechacierre timestamp without time zone,
    estatus public.estatus_sesion_enum DEFAULT 'ABIERTA'::public.estatus_sesion_enum NOT NULL,
    usuario_creador_id integer
);


ALTER TABLE public.toma_inventario_sesiones OWNER TO ferram;

--
-- TOC entry 5095 (class 0 OID 0)
-- Dependencies: 307
-- Name: TABLE toma_inventario_sesiones; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.toma_inventario_sesiones IS 'Cabecera para agrupador tomas de inventario físicas (Auditorías)';


--
-- TOC entry 308 (class 1259 OID 25339)
-- Name: toma_inventario_sesiones_sesionid_seq; Type: SEQUENCE; Schema: public; Owner: ferram
--

CREATE SEQUENCE public.toma_inventario_sesiones_sesionid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.toma_inventario_sesiones_sesionid_seq OWNER TO ferram;

--
-- TOC entry 5096 (class 0 OID 0)
-- Dependencies: 308
-- Name: toma_inventario_sesiones_sesionid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.toma_inventario_sesiones_sesionid_seq OWNED BY public.toma_inventario_sesiones.sesionid;


--
-- TOC entry 309 (class 1259 OID 25340)
-- Name: v_resumen_bancario_proveedores; Type: VIEW; Schema: public; Owner: ferram
--

CREATE VIEW public.v_resumen_bancario_proveedores AS
 SELECT p.proveedorid,
    p.nombreempresa,
    sum(COALESCE(cxp.monto_total, (0)::numeric)) AS deuda_total_historica,
    sum((COALESCE(cxp.monto_total, (0)::numeric) - COALESCE(cxp.monto_pagado, (0)::numeric))) AS saldo_pendiente_pago,
    count(cxp.cxp_id) FILTER (WHERE ((cxp.estatus <> 'PAGADO'::public.estatus_cxp_enum) AND (cxp.estatus <> 'CANCELADO'::public.estatus_cxp_enum))) AS facturas_vivas
   FROM (public.proveedores p
     LEFT JOIN public.cuentas_por_pagar cxp ON ((p.proveedorid = cxp.proveedor_id)))
  GROUP BY p.proveedorid, p.nombreempresa;


ALTER VIEW public.v_resumen_bancario_proveedores OWNER TO ferram;

--
-- TOC entry 4241 (class 2604 OID 25345)
-- Name: administradores adminid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.administradores ALTER COLUMN adminid SET DEFAULT nextval('public.administradores_adminid_seq'::regclass);


--
-- TOC entry 4245 (class 2604 OID 25346)
-- Name: agentesdeventas agenteid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.agentesdeventas ALTER COLUMN agenteid SET DEFAULT nextval('public.agentesdeventas_agenteid_seq'::regclass);


--
-- TOC entry 4248 (class 2604 OID 25347)
-- Name: carritodecompra carritoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.carritodecompra ALTER COLUMN carritoid SET DEFAULT nextval('public.carritodecompra_carritoid_seq'::regclass);


--
-- TOC entry 4250 (class 2604 OID 25348)
-- Name: cat_cxp_etiquetas etiqueta_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_cxp_etiquetas ALTER COLUMN etiqueta_id SET DEFAULT nextval('public.cat_cxp_etiquetas_etiqueta_id_seq'::regclass);


--
-- TOC entry 4253 (class 2604 OID 25349)
-- Name: cat_tamanopaquetes tamanoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_tamanopaquetes ALTER COLUMN tamanoid SET DEFAULT nextval('public.cat_tamanopaquetes_tamanoid_seq'::regclass);


--
-- TOC entry 4254 (class 2604 OID 25350)
-- Name: categorias categoriaid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.categorias ALTER COLUMN categoriaid SET DEFAULT nextval('public.categorias_categoriaid_seq'::regclass);


--
-- TOC entry 4256 (class 2604 OID 25351)
-- Name: cliente_creditos credito_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_creditos ALTER COLUMN credito_id SET DEFAULT nextval('public.cliente_creditos_credito_id_seq'::regclass);


--
-- TOC entry 4264 (class 2604 OID 25352)
-- Name: cliente_direcciones direccionid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_direcciones ALTER COLUMN direccionid SET DEFAULT nextval('public.cliente_direcciones_direccionid_seq'::regclass);


--
-- TOC entry 4265 (class 2604 OID 25353)
-- Name: clientes clienteid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.clientes ALTER COLUMN clienteid SET DEFAULT nextval('public.clientes_clienteid_seq'::regclass);


--
-- TOC entry 4268 (class 2604 OID 25354)
-- Name: comisiones comisionid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.comisiones ALTER COLUMN comisionid SET DEFAULT nextval('public.comisiones_comisionid_seq'::regclass);


--
-- TOC entry 4271 (class 2604 OID 25355)
-- Name: communicationlogs logid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs ALTER COLUMN logid SET DEFAULT nextval('public.communicationlogs_logid_seq'::regclass);


--
-- TOC entry 4273 (class 2604 OID 25356)
-- Name: control_cambios id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.control_cambios ALTER COLUMN id SET DEFAULT nextval('public.control_cambios_id_seq'::regclass);


--
-- TOC entry 4276 (class 2604 OID 25357)
-- Name: credito_movimientos movimiento_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.credito_movimientos ALTER COLUMN movimiento_id SET DEFAULT nextval('public.credito_movimientos_movimiento_id_seq'::regclass);


--
-- TOC entry 4278 (class 2604 OID 25358)
-- Name: cuentas_por_cobrar cxcid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_cobrar ALTER COLUMN cxcid SET DEFAULT nextval('public.cuentas_por_cobrar_cxcid_seq'::regclass);


--
-- TOC entry 4280 (class 2604 OID 25359)
-- Name: cuentas_por_pagar cxp_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_pagar ALTER COLUMN cxp_id SET DEFAULT nextval('public.cuentas_por_pagar_cxp_id_seq'::regclass);


--
-- TOC entry 4371 (class 2604 OID 25896)
-- Name: cupones cuponid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cupones ALTER COLUMN cuponid SET DEFAULT nextval('public.cupones_cuponid_seq'::regclass);


--
-- TOC entry 4285 (class 2604 OID 25360)
-- Name: cxp_etiquetas_asignadas asignacion_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cxp_etiquetas_asignadas ALTER COLUMN asignacion_id SET DEFAULT nextval('public.cxp_etiquetas_asignadas_asignacion_id_seq'::regclass);


--
-- TOC entry 4287 (class 2604 OID 25361)
-- Name: datos_bancarios_empresa id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.datos_bancarios_empresa ALTER COLUMN id SET DEFAULT nextval('public.datos_bancarios_empresa_id_seq'::regclass);


--
-- TOC entry 4290 (class 2604 OID 25362)
-- Name: detallesdelpedido detalleid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesdelpedido ALTER COLUMN detalleid SET DEFAULT nextval('public.detallesdelpedido_detalleid_seq'::regclass);


--
-- TOC entry 4294 (class 2604 OID 25363)
-- Name: detallesordencompra detalleoc_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra ALTER COLUMN detalleoc_id SET DEFAULT nextval('public.detallesordencompra_detalleoc_id_seq'::regclass);


--
-- TOC entry 4387 (class 2604 OID 26158)
-- Name: developers dev_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.developers ALTER COLUMN dev_id SET DEFAULT nextval('public.developers_dev_id_seq'::regclass);


--
-- TOC entry 4304 (class 2604 OID 25364)
-- Name: estados estadoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados ALTER COLUMN estadoid SET DEFAULT nextval('public.estados_estadoid_seq'::regclass);


--
-- TOC entry 4377 (class 2604 OID 25941)
-- Name: inventarios_admin inventario_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.inventarios_admin ALTER COLUMN inventario_id SET DEFAULT nextval('public.inventarios_admin_inventario_id_seq'::regclass);


--
-- TOC entry 4305 (class 2604 OID 25365)
-- Name: itemsdelcarrito itemid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.itemsdelcarrito ALTER COLUMN itemid SET DEFAULT nextval('public.itemsdelcarrito_itemid_seq'::regclass);


--
-- TOC entry 4380 (class 2604 OID 26117)
-- Name: landing_page_config config_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.landing_page_config ALTER COLUMN config_id SET DEFAULT nextval('public.landing_page_config_config_id_seq'::regclass);


--
-- TOC entry 4306 (class 2604 OID 25366)
-- Name: log_eventosusuario eventoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario ALTER COLUMN eventoid SET DEFAULT nextval('public.log_eventosusuario_eventoid_seq'::regclass);


--
-- TOC entry 4308 (class 2604 OID 25367)
-- Name: log_inventario logid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_inventario ALTER COLUMN logid SET DEFAULT nextval('public.log_inventario_logid_seq'::regclass);


--
-- TOC entry 4311 (class 2604 OID 25368)
-- Name: log_movimientos logid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_movimientos ALTER COLUMN logid SET DEFAULT nextval('public.log_movimientos_logid_seq'::regclass);


--
-- TOC entry 4313 (class 2604 OID 25369)
-- Name: medidas medidaid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas ALTER COLUMN medidaid SET DEFAULT nextval('public.medidas_medidaid_seq'::regclass);


--
-- TOC entry 4299 (class 2604 OID 25370)
-- Name: notificaciones notificacionid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones ALTER COLUMN notificacionid SET DEFAULT nextval('public.notificaciones_notificacionid_seq'::regclass);


--
-- TOC entry 4318 (class 2604 OID 25371)
-- Name: ordenesdecompra ordencompraid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.ordenesdecompra ALTER COLUMN ordencompraid SET DEFAULT nextval('public.ordenesdecompra_ordencompraid_seq'::regclass);


--
-- TOC entry 4325 (class 2604 OID 25372)
-- Name: pagos_clientes pago_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_clientes ALTER COLUMN pago_id SET DEFAULT nextval('public.pagos_clientes_pago_id_seq'::regclass);


--
-- TOC entry 4329 (class 2604 OID 25373)
-- Name: pagos_cxp pago_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_cxp ALTER COLUMN pago_id SET DEFAULT nextval('public.pagos_cxp_pago_id_seq'::regclass);


--
-- TOC entry 4331 (class 2604 OID 25374)
-- Name: passwordresettokens tokenid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens ALTER COLUMN tokenid SET DEFAULT nextval('public.passwordresettokens_tokenid_seq'::regclass);


--
-- TOC entry 4332 (class 2604 OID 25375)
-- Name: pedidos pedidoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pedidos ALTER COLUMN pedidoid SET DEFAULT nextval('public.pedidos_pedidoid_seq'::regclass);


--
-- TOC entry 4340 (class 2604 OID 25376)
-- Name: producto_imagenes imagenid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_imagenes ALTER COLUMN imagenid SET DEFAULT nextval('public.producto_imagenes_imagenid_seq'::regclass);


--
-- TOC entry 4369 (class 2604 OID 25880)
-- Name: producto_imagenes_color imagencolorid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_imagenes_color ALTER COLUMN imagencolorid SET DEFAULT nextval('public.producto_imagenes_color_imagencolorid_seq'::regclass);


--
-- TOC entry 4342 (class 2604 OID 25377)
-- Name: producto_variante_imagenes imagenid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variante_imagenes ALTER COLUMN imagenid SET DEFAULT nextval('public.producto_variante_imagenes_imagenid_seq'::regclass);


--
-- TOC entry 4344 (class 2604 OID 25378)
-- Name: producto_variantes varianteid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variantes ALTER COLUMN varianteid SET DEFAULT nextval('public.producto_variantes_varianteid_seq'::regclass);


--
-- TOC entry 4352 (class 2604 OID 25379)
-- Name: productos productoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos ALTER COLUMN productoid SET DEFAULT nextval('public.productos_productoid_seq1'::regclass);


--
-- TOC entry 4354 (class 2604 OID 25380)
-- Name: proveedor_reglas_empaque reglaid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedor_reglas_empaque ALTER COLUMN reglaid SET DEFAULT nextval('public.proveedor_reglas_empaque_reglaid_seq'::regclass);


--
-- TOC entry 4356 (class 2604 OID 25381)
-- Name: proveedores proveedorid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedores ALTER COLUMN proveedorid SET DEFAULT nextval('public.proveedores_proveedorid_seq'::regclass);


--
-- TOC entry 4357 (class 2604 OID 25382)
-- Name: solicitudes_credito solicitud_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.solicitudes_credito ALTER COLUMN solicitud_id SET DEFAULT nextval('public.solicitudes_credito_solicitud_id_seq'::regclass);


--
-- TOC entry 4384 (class 2604 OID 26147)
-- Name: tenants tenant_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.tenants ALTER COLUMN tenant_id SET DEFAULT nextval('public.tenants_tenant_id_seq'::regclass);


--
-- TOC entry 4360 (class 2604 OID 25383)
-- Name: tipoproducto tipoproductoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.tipoproducto ALTER COLUMN tipoproductoid SET DEFAULT nextval('public.tipoproducto_tipoproductoid_seq'::regclass);


--
-- TOC entry 4363 (class 2604 OID 25384)
-- Name: toma_inventario_conteos conteoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_conteos ALTER COLUMN conteoid SET DEFAULT nextval('public.toma_inventario_conteos_conteoid_seq'::regclass);


--
-- TOC entry 4366 (class 2604 OID 25385)
-- Name: toma_inventario_sesiones sesionid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_sesiones ALTER COLUMN sesionid SET DEFAULT nextval('public.toma_inventario_sesiones_sesionid_seq'::regclass);


--
-- TOC entry 4230 (class 0 OID 24745)
-- Dependencies: 222
-- Data for Name: job; Type: TABLE DATA; Schema: cron; Owner: azuresu
--

COPY cron.job (jobid, schedule, command, nodename, nodeport, database, username, active, jobname) FROM stdin;
\.


--
-- TOC entry 4232 (class 0 OID 24764)
-- Dependencies: 224
-- Data for Name: job_run_details; Type: TABLE DATA; Schema: cron; Owner: azuresu
--

COPY cron.job_run_details (jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time) FROM stdin;
\.


--
-- TOC entry 4829 (class 0 OID 25022)
-- Dependencies: 225
-- Data for Name: administradores; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.administradores (adminid, nombre, email, passwordhash, rol, activo, fechacreacion, apellido, banco, numero_cuenta, clabe, titular) FROM stdin;
2	Fernando	fegarcia@hotmail.com	$2b$10$qDMIe7cygYpnw13f67vMn.wxKqlrUV32fWdyXsUoRKDRw1XmrN/ma	superadmin	t	2025-11-06 12:09:59.605448	Garcia                                                                                              	BBVA	12321323123	123123123123123123	Prueba 1
4	Alejandra Calderón	alecaja.19@gmail.com	$2b$10$bVTxKPf5YFi9wvEC2w8kUeWXjY77aXZEYJfrN2qhn52X0u57g2Lre	admin	t	2026-01-02 20:43:37.083971	                                                                                                    	\N	\N	\N	\N
5	Lupita García	pupis_gr@icloud.com	$2b$10$SsgX.yO3ttH6aaEh8qISqeJlsn2K2BpAjgjXxNJrVOWSPhw8BwQUi	admin	t	2026-01-02 20:49:05.63054	                                                                                                    	\N	\N	\N	\N
7	Maricela García	maricelag.e@hotmail.com	$2b$10$JkriMBwuYGdiJlk.Go8JguxXoGnvWzsE0Zsmtn3foSRUr/hk4kyka	admin	t	2026-01-02 23:02:29.212694	                                                                                                    	\N	\N	\N	\N
\.


--
-- TOC entry 4831 (class 0 OID 25031)
-- Dependencies: 227
-- Data for Name: agentesdeventas; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.agentesdeventas (agenteid, nombre, apellido, email, passwordhash, codigoagente, activo, esadmin, adminrol, banco, numero_cuenta, clabe, titular) FROM stdin;
1	Lupita	García	pupis_gr@hotmail.com	$2b$10$6t8maMlHk52sLRQ4PSGnJe0y/6gbIlEQYtlNgba/HwV1LzArkqfie	AG0001	t	f	\N	\N	\N	\N	\N
2	José	García	jofegara.78@gmail.com	$2b$10$hW5OBaBiUbRPIK7nzbpXAeUFHNuulZEoR.FtLI.gkDcTR0PMi0.Y6	AG0002	t	f	\N	\N	\N	\N	\N
\.


--
-- TOC entry 4833 (class 0 OID 25039)
-- Dependencies: 229
-- Data for Name: carritodecompra; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.carritodecompra (carritoid, clienteid, fechacreacion, ultimamodificacion) FROM stdin;
1	1	2026-01-06 18:27:31.675743	\N
2	4	2026-01-06 23:52:33.779927	2026-01-06 23:52:33.779927
\.


--
-- TOC entry 4835 (class 0 OID 25044)
-- Dependencies: 231
-- Data for Name: cat_cxp_etiquetas; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.cat_cxp_etiquetas (etiqueta_id, nombre, color_hex, icono, activo) FROM stdin;
\.


--
-- TOC entry 4837 (class 0 OID 25050)
-- Dependencies: 233
-- Data for Name: cat_tamanopaquetes; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.cat_tamanopaquetes (tamanoid, cantidad) FROM stdin;
1	1
2	3
3	6
4	12
5	4
\.


--
-- TOC entry 4839 (class 0 OID 25054)
-- Dependencies: 235
-- Data for Name: categorias; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.categorias (categoriaid, nombre, descripcion, parentcategoriaid, activo, imagen_url, imagen_public_id) FROM stdin;
2	Amor	\N	\N	t	https://res.cloudinary.com/daylne1ml/image/upload/v1767483819/categories/hxivvedrcy19xk06ugjn.png	categories/hxivvedrcy19xk06ugjn
3	Toda ocasión	Cajas de cumpleaños que dan color a tu regalo 🎁	\N	t	https://res.cloudinary.com/daylne1ml/image/upload/v1767484732/categories/mrfszpgqjl4zvot4bei0.png	categories/mrfszpgqjl4zvot4bei0
1	Lisas	Cajas perfectas para cualquier época del año!	\N	t	https://res.cloudinary.com/daylne1ml/image/upload/v1767484774/categories/idyffvrvkmy3o9dmxsuw.png	categories/idyffvrvkmy3o9dmxsuw
4	Natural	\N	\N	t	https://res.cloudinary.com/daylne1ml/image/upload/v1767484784/categories/t49i7w3jzlrrtvfgj7bw.png	categories/t49i7w3jzlrrtvfgj7bw
\.


--
-- TOC entry 4841 (class 0 OID 25061)
-- Dependencies: 237
-- Data for Name: cliente_creditos; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.cliente_creditos (credito_id, cliente_id, limite_credito, saldo_deudor, dias_gracia, estado_credito, fecha_creacion, ultima_actualizacion, exportado_en, reporte_id) FROM stdin;
\.


--
-- TOC entry 4843 (class 0 OID 25074)
-- Dependencies: 239
-- Data for Name: cliente_direcciones; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.cliente_direcciones (direccionid, clienteid, etiqueta, receptor, calle, numeroext, numeroint, colonia, ciudad, codigopostal, telefonocontacto, estadoid) FROM stdin;
\.


--
-- TOC entry 4845 (class 0 OID 25080)
-- Dependencies: 241
-- Data for Name: clientes; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.clientes (clienteid, nombre, apellido, email, passwordhash, telefono, fechaderegistro, activo, agenteid, google_id, avatar_url) FROM stdin;
1	Fernando	Ramírez	dferramm@gmail.com	$2b$10$ZUcnN9znOWCy8X1RbUEF6.yBpyY3CzbMUVDZ/F27iKXiVDv2lRRmS	5560989524	2026-01-05 05:23:11.396759	t	\N	107035380971984210505	https://lh3.googleusercontent.com/a/ACg8ocKNxihdAINOrco8B52uUBljbYq3DjLlFlU9VsDVdeuo9DZ5IQ=s96-c
2	Diego Fernando	Ramírez García	dferram8@gmail.com	\N	\N	2026-01-05 20:01:06.815611	t	\N	112463414682839499861	https://lh3.googleusercontent.com/a/ACg8ocL4vAqVyYj3GucQspTlE6BtmuyoqZqML7L4Zcb7WdwdcHT9m4E=s96-c
3	Maria Teresa	Garcia	\N	$2b$10$Zkbye7ng5W0WaF7U.D7zre.ggz4qw0MMsYZRrKUh5s6yy.mOvtSu2	5526125531	2026-01-06 18:10:42.362124	t	\N	\N	\N
4	Nohemi	Zuñiga	\N	$2b$10$FBFKnpHsawMgchp1rv2IJOOvSkp.xO2ZxxG1207UAdHEdUdMbg.xC	7731158195	2026-01-06 23:51:33.737605	t	\N	\N	\N
\.


--
-- TOC entry 4847 (class 0 OID 25088)
-- Dependencies: 243
-- Data for Name: comisiones; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.comisiones (comisionid, pedidoid, agenteid, montocomision, fechacalculo, estatus) FROM stdin;
\.


--
-- TOC entry 4849 (class 0 OID 25094)
-- Dependencies: 245
-- Data for Name: communicationlogs; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) FROM stdin;
1	2026-01-07 23:22:16.133393	dferramm@gmail.com	Instrucciones para restablecer tu contraseña	Enviado	\N	\N	\N	\N
\.


--
-- TOC entry 4851 (class 0 OID 25102)
-- Dependencies: 247
-- Data for Name: control_cambios; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) FROM stdin;
1	categorias	2	INSERT	\N	{"activo": true, "nombre": "Amor", "categoriaid": 2, "descripcion": null, "parentcategoriaid": null}	2	APROBADO	2025-12-24 16:36:57.883671	2025-12-24 16:36:57.883671	2
2	proveedores	1	INSERT	\N	{"rfc": null, "banco": null, "calle": null, "clabe": null, "email": null, "ciudad": null, "estado": null, "colonia": null, "telefono": null, "diascredito": null, "emailventas": null, "proveedorid": 1, "razonsocial": null, "codigopostal": null, "minimocompra": null, "numerocuenta": null, "celularventas": null, "emailcobranza": null, "limitecredito": null, "nombreempresa": "Fashion", "regimenfiscal": null, "contactonombre": null, "referenciapago": null, "telefonocobranza": null, "aceptadevoluciones": false, "descuentofinanciero": null, "nombrecontactocobranza": null, "nombrerepresentanteventas": null}	2	APROBADO	2025-12-24 16:37:12.72206	2025-12-24 16:37:12.72206	2
3	productos	1	INSERT	\N	{"activo": true, "productoid": 1, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-CUBO", "nombreproducto": "Cubo Colors Love"}	2	APROBADO	2025-12-24 17:14:16.684696	2025-12-24 17:14:16.684696	2
4	productos	1	UPDATE	{"activo": true, "productoid": 1, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-CUBO", "nombreproducto": "Cubo Colors Love", "tipoproductoid": null}	{"activo": true, "productoid": 1, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-CUBO", "nombreproducto": "Colors Love Cubo", "tipoproductoid": null, "proveedorid_default": 1}	2	APROBADO	2025-12-24 17:15:17.316257	2025-12-24 17:15:17.316257	2
5	productos	2	INSERT	\N	{"activo": true, "productoid": 2, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-LVOR", "nombreproducto": "LV Oro"}	2	APROBADO	2025-12-25 06:07:04.366391	2025-12-25 06:07:04.366391	2
6	productos	3	INSERT	\N	{"activo": true, "productoid": 3, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-BRIL", "nombreproducto": "Brillo"}	2	APROBADO	2025-12-25 06:10:40.960643	2025-12-25 06:10:40.960643	2
7	productos	4	INSERT	\N	{"activo": true, "productoid": 4, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-BLAC", "nombreproducto": "Black"}	2	APROBADO	2025-12-25 06:14:06.917618	2025-12-25 06:14:06.917618	2
8	productos	5	INSERT	\N	{"activo": true, "productoid": 5, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-CRAF", "nombreproducto": "Craft"}	2	APROBADO	2025-12-25 06:20:27.633495	2025-12-25 06:20:27.633495	2
9	productos	6	INSERT	\N	{"activo": true, "productoid": 6, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-COLO", "nombreproducto": "Colores"}	2	APROBADO	2025-12-25 06:23:13.818184	2025-12-25 06:23:13.818184	2
10	productos	7	INSERT	\N	{"activo": true, "productoid": 7, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-REDB", "nombreproducto": "RedBlack"}	2	APROBADO	2025-12-25 06:25:42.055698	2025-12-25 06:25:42.055698	2
11	productos	8	INSERT	\N	{"activo": true, "productoid": 8, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-HECH", "nombreproducto": "Hecho en México"}	2	APROBADO	2025-12-25 06:27:35.096206	2025-12-25 06:27:35.096206	2
12	productos	4	UPDATE	{"activo": true, "reglaid": null, "productoid": 4, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-BLAC", "nombreproducto": "Black"}	{"activo": true, "reglaid": 1, "productoid": 4, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-BLAC", "nombreproducto": "Black", "proveedorid_default": 1}	2	APROBADO	2025-12-25 11:28:36.979176	2025-12-25 11:28:36.979176	2
13	productos	4	UPDATE	{"activo": true, "reglaid": 1, "productoid": 4, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-BLAC", "nombreproducto": "Black"}	{"activo": true, "reglaid": 1, "productoid": 4, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-BLAC", "nombreproducto": "Black", "proveedorid_default": 1}	2	APROBADO	2025-12-25 11:29:47.971708	2025-12-25 11:29:47.971708	2
14	productos	3	UPDATE	{"activo": true, "reglaid": null, "productoid": 3, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-BRIL", "nombreproducto": "Brillo"}	{"activo": true, "reglaid": 1, "productoid": 3, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-BRIL", "nombreproducto": "Brillo", "proveedorid_default": 1}	2	APROBADO	2025-12-25 11:30:03.549911	2025-12-25 11:30:03.549911	2
15	productos	6	UPDATE	{"activo": true, "reglaid": null, "productoid": 6, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-COLO", "nombreproducto": "Colores"}	{"activo": true, "reglaid": null, "productoid": 6, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-COLO", "nombreproducto": "Colores", "proveedorid_default": 1}	2	APROBADO	2025-12-25 11:30:42.251757	2025-12-25 11:30:42.251757	2
16	productos	6	UPDATE	{"activo": true, "reglaid": null, "productoid": 6, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-COLO", "nombreproducto": "Colores"}	{"activo": true, "reglaid": 1, "productoid": 6, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-COLO", "nombreproducto": "Colores", "proveedorid_default": 1}	2	APROBADO	2025-12-25 11:31:04.688062	2025-12-25 11:31:04.688062	2
17	productos	1	UPDATE	{"activo": true, "reglaid": null, "productoid": 1, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-CUBO", "nombreproducto": "Colors Love Cubo"}	{"activo": true, "reglaid": 1, "productoid": 1, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-CUBO", "nombreproducto": "Colors Love Cubo", "proveedorid_default": 1}	2	APROBADO	2025-12-25 11:31:18.488298	2025-12-25 11:31:18.488298	2
18	productos	5	UPDATE	{"activo": true, "reglaid": null, "productoid": 5, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-CRAF", "nombreproducto": "Craft"}	{"activo": true, "reglaid": 1, "productoid": 5, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-CRAF", "nombreproducto": "Craft", "proveedorid_default": 1}	2	APROBADO	2025-12-25 11:31:44.889572	2025-12-25 11:31:44.889572	2
19	productos	8	UPDATE	{"activo": true, "reglaid": null, "productoid": 8, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-HECH", "nombreproducto": "Hecho en México"}	{"activo": true, "reglaid": 1, "productoid": 8, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-HECH", "nombreproducto": "Hecho en México", "proveedorid_default": 1}	2	APROBADO	2025-12-25 11:31:56.469369	2025-12-25 11:31:56.469369	2
60	productos	16	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 16, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-021", "nombreproducto": "Cubo Novios Guapos"}	4	APROBADO	2026-01-03 21:26:49.225487	2026-01-03 21:26:49.225487	4
20	productos	2	UPDATE	{"activo": true, "reglaid": null, "productoid": 2, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-LVOR", "nombreproducto": "LV Oro"}	{"activo": true, "reglaid": 1, "productoid": 2, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-LVOR", "nombreproducto": "LV Oro", "proveedorid_default": 1}	2	APROBADO	2025-12-25 11:32:11.928208	2025-12-25 11:32:11.928208	2
21	productos	7	UPDATE	{"activo": true, "reglaid": null, "productoid": 7, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-REDB", "nombreproducto": "RedBlack"}	{"activo": true, "reglaid": 1, "productoid": 7, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-REDB", "nombreproducto": "RedBlack", "proveedorid_default": 1}	2	APROBADO	2025-12-25 11:32:25.472244	2025-12-25 11:32:25.472244	2
22	pedidos	4	UPDATE	{"estatus": "Parcialmente Surtido", "pedidoid": 4}	{"estatus": "Confirmado", "pedidoid": 4}	2	APROBADO	2025-12-25 12:03:24.101952	2025-12-25 12:03:24.101952	2
23	pedidos	4	UPDATE	{"estatus": "Confirmado", "pedidoid": 4}	{"estatus": "Enviado", "pedidoid": 4}	2	APROBADO	2025-12-25 12:03:36.153384	2025-12-25 12:03:36.153384	2
24	pedidos	4	UPDATE	{"estatus": "Enviado", "pedidoid": 4}	{"estatus": "Confirmado", "pedidoid": 4}	2	APROBADO	2025-12-25 12:04:12.9404	2025-12-25 12:04:12.9404	2
25	pedidos	4	UPDATE	{"estatus": "Confirmado", "pedidoid": 4}	{"estatus": "Entregado", "pedidoid": 4}	2	APROBADO	2025-12-25 12:05:20.262903	2025-12-25 12:05:20.262903	2
26	pedidos	6	UPDATE	{"estatus": "Parcialmente Surtido", "pedidoid": 6}	{"estatus": "Confirmado", "pedidoid": 6}	2	APROBADO	2025-12-25 12:35:08.770103	2025-12-25 12:35:08.770103	2
27	proveedores	3	INSERT	\N	{"rfc": null, "banco": null, "calle": null, "clabe": null, "email": null, "ciudad": null, "estado": null, "colonia": null, "telefono": null, "diascredito": null, "emailventas": null, "proveedorid": 3, "razonsocial": null, "codigopostal": null, "minimocompra": null, "numerocuenta": null, "celularventas": null, "emailcobranza": null, "limitecredito": null, "nombreempresa": "ExploWorld", "regimenfiscal": null, "contactonombre": null, "referenciapago": null, "telefonocobranza": null, "aceptadevoluciones": false, "descuentofinanciero": null, "nombrecontactocobranza": null, "nombrerepresentanteventas": null}	2	APROBADO	2025-12-26 13:40:58.939631	2025-12-26 13:40:58.939631	2
28	categorias	3	INSERT	\N	{"activo": true, "nombre": "Toda Ocasión", "categoriaid": 3, "descripcion": null, "parentcategoriaid": null}	2	APROBADO	2025-12-26 13:43:56.448044	2025-12-26 13:43:56.448044	2
29	productos	9	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 9, "categoriaid": 2, "descripcion": "Cubo Acetato", "proveedorid": 1, "sku_maestro": "AMO-018", "nombreproducto": "Cubo Acetato"}	2	APROBADO	2025-12-26 13:52:22.610319	2025-12-26 13:52:22.610319	2
30	productos	9	UPDATE	{"activo": true, "reglaid": 1, "productoid": 9, "categoriaid": 2, "descripcion": "Cubo Acetato", "proveedorid": 1, "sku_maestro": "AMO-018", "nombreproducto": "Cubo Acetato"}	{"activo": true, "reglaid": 1, "productoid": 9, "categoriaid": 2, "descripcion": "Cubo Acetato", "sku_maestro": "AMO-018", "nombreproducto": "Cubo Acetato", "proveedorid_default": 1}	2	APROBADO	2025-12-26 14:55:23.048718	2025-12-26 14:55:23.048718	2
31	productos	10	INSERT	\N	{"activo": true, "reglaid": 5, "productoid": 10, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-019", "nombreproducto": "Libreta"}	2	APROBADO	2025-12-26 15:04:45.274991	2025-12-26 15:04:45.274991	2
32	productos	11	INSERT	\N	{"activo": true, "reglaid": 2, "productoid": 11, "categoriaid": 1, "descripcion": null, "proveedorid": 1, "sku_maestro": "LIS-001", "nombreproducto": "Cubo Liso"}	2	APROBADO	2025-12-26 15:27:12.852081	2025-12-26 15:27:12.852081	2
33	productos	3	UPDATE	{"activo": true, "reglaid": 1, "productoid": 3, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-006", "nombreproducto": "Brillo"}	{"activo": true, "reglaid": 1, "productoid": 3, "categoriaid": 1, "descripcion": null, "sku_maestro": "AMO-006", "nombreproducto": "Brillo", "proveedorid_default": 1}	2	APROBADO	2025-12-26 15:31:45.71898	2025-12-26 15:31:45.71898	2
34	categorias	4	INSERT	\N	{"activo": true, "nombre": "Natural", "categoriaid": 4, "descripcion": null, "parentcategoriaid": null}	2	APROBADO	2025-12-26 15:33:03.471727	2025-12-26 15:33:03.471727	2
35	productos	12	INSERT	\N	{"activo": true, "reglaid": 2, "productoid": 12, "categoriaid": 4, "descripcion": null, "proveedorid": 1, "sku_maestro": "NAT-001", "nombreproducto": "Cubo Natural"}	2	APROBADO	2025-12-26 15:36:29.447567	2025-12-26 15:36:29.447567	2
36	productos	13	INSERT	\N	{"activo": true, "reglaid": 2, "productoid": 13, "categoriaid": 4, "descripcion": null, "proveedorid": 1, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural"}	2	APROBADO	2025-12-26 15:45:16.84568	2025-12-26 15:45:16.84568	2
37	productos	13	UPDATE	{"activo": true, "reglaid": 2, "productoid": 13, "categoriaid": 4, "descripcion": null, "proveedorid": 1, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural"}	{"activo": true, "reglaid": 2, "productoid": 13, "categoriaid": 4, "descripcion": null, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural", "proveedorid_default": 1}	2	APROBADO	2025-12-26 16:30:15.027754	2025-12-26 16:30:15.027754	2
38	productos	13	UPDATE	{"activo": true, "reglaid": 2, "productoid": 13, "categoriaid": 4, "descripcion": null, "proveedorid": 1, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural"}	{"activo": true, "reglaid": 2, "productoid": 13, "categoriaid": 4, "descripcion": null, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural", "proveedorid_default": 1}	2	APROBADO	2025-12-26 16:32:10.704473	2025-12-26 16:32:10.704473	2
39	productos	13	UPDATE	{"activo": true, "reglaid": 2, "productoid": 13, "categoriaid": 4, "descripcion": null, "proveedorid": 1, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural"}	{"activo": true, "reglaid": 1, "productoid": 13, "categoriaid": 4, "descripcion": null, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural", "proveedorid_default": 1}	2	APROBADO	2025-12-26 16:38:02.654604	2025-12-26 16:38:02.654604	2
40	productos	10	UPDATE	{"activo": true, "reglaid": 5, "productoid": 10, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-019", "nombreproducto": "Libreta"}	{"activo": true, "reglaid": 5, "productoid": 10, "categoriaid": 2, "descripcion": null, "sku_maestro": "AMO-019", "nombreproducto": "Libreta", "proveedorid_default": 1}	2	APROBADO	2025-12-31 08:52:28.749917	2025-12-31 08:52:28.749917	2
41	productos	14	INSERT	\N	{"activo": true, "reglaid": 2, "productoid": 14, "categoriaid": 1, "descripcion": null, "proveedorid": 1, "sku_maestro": "LIS-002", "nombreproducto": "Línea Metalizada"}	2	APROBADO	2025-12-31 08:56:50.280269	2025-12-31 08:56:50.280269	2
42	productos	14	UPDATE	{"activo": true, "reglaid": 2, "productoid": 14, "categoriaid": 1, "descripcion": null, "proveedorid": 1, "sku_maestro": "LIS-002", "nombreproducto": "Línea Metalizada"}	{"activo": true, "reglaid": 1, "productoid": 14, "categoriaid": 1, "descripcion": null, "sku_maestro": "LIS-002", "nombreproducto": "Línea Metalizada", "proveedorid_default": 1}	2	APROBADO	2025-12-31 09:15:49.773776	2025-12-31 09:15:49.773776	2
43	pedidos	17	UPDATE	{"pagado": false, "estatus": "Parcialmente Surtido"}	{"monto": "128.70", "accion": "APROBAR_PAGO_TRANSFERENCIA", "pagado": true, "cliente": "Diego Fernando Ramírez García", "estatus": "Confirmado"}	2	APROBADO	2026-01-02 06:24:26.956375	2026-01-02 06:24:26.956375	2
44	admins	4	INSERT	\N	{"rol": "admin", "email": "alecaja.19@gmail.com", "activo": true, "nombre": "Alejandra Calderón", "adminid": 4, "apellido": "                                                                                                    "}	2	APROBADO	2026-01-02 20:43:37.09496	2026-01-02 20:43:37.09496	2
45	admins	5	INSERT	\N	{"rol": "admin", "email": "pupis_gr@icloud.com", "activo": true, "nombre": "Lupita García", "adminid": 5, "apellido": "                                                                                                    "}	2	APROBADO	2026-01-02 20:49:05.635416	2026-01-02 20:49:05.635416	2
46	admins	6	INSERT	\N	{"rol": "admin", "email": "maricelag.e@hotmail.com", "activo": true, "nombre": "Maricela García", "adminid": 6, "apellido": "                                                                                                    "}	2	APROBADO	2026-01-02 23:00:58.087258	2026-01-02 23:00:58.087258	2
47	admins	7	INSERT	\N	{"rol": "admin", "email": "maricelag.e@hotmail.com", "activo": true, "nombre": "Maricela García", "adminid": 7, "apellido": "                                                                                                    "}	2	APROBADO	2026-01-02 23:02:29.217336	2026-01-02 23:02:29.217336	2
48	productos	4	UPDATE	{"activo": true, "reglaid": 1, "productoid": 4, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-008", "nombreproducto": "Black"}	{"activo": true, "reglaid": 1, "productoid": 4, "categoriaid": 2, "descripcion": null, "sku_maestro": "AMO-008", "nombreproducto": "Love Black", "proveedorid_default": 1}	4	APROBADO	2026-01-03 17:28:32.748679	2026-01-03 17:28:32.748679	4
49	productos	1	UPDATE	{"activo": true, "reglaid": 1, "productoid": 1, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-001", "nombreproducto": "Colors Love Cubo"}	{"activo": true, "reglaid": 1, "productoid": 1, "categoriaid": 2, "descripcion": null, "sku_maestro": "AMO-001", "nombreproducto": "Cubo Colors Love", "proveedorid_default": 1}	4	APROBADO	2026-01-03 17:39:12.68726	2026-01-03 17:39:12.68726	4
50	productos	4	UPDATE	{"activo": true, "reglaid": 1, "productoid": 4, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-008", "nombreproducto": "Love Black"}	{"activo": true, "reglaid": 1, "productoid": 4, "categoriaid": 2, "descripcion": null, "sku_maestro": "AMO-008", "nombreproducto": "Cubo Love Black", "proveedorid_default": 1}	4	APROBADO	2026-01-03 17:40:16.957553	2026-01-03 17:40:16.957553	4
51	productos	8	UPDATE	{"activo": true, "reglaid": 1, "productoid": 8, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-016", "nombreproducto": "Hecho en México"}	{"activo": true, "reglaid": 2, "productoid": 8, "categoriaid": 2, "descripcion": null, "sku_maestro": "AMO-016", "nombreproducto": "Cubo Hecho en México", "proveedorid_default": 1}	4	APROBADO	2026-01-03 17:51:12.318799	2026-01-03 17:51:12.318799	4
52	productos	5	UPDATE	{"activo": true, "reglaid": 1, "productoid": 5, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-010", "nombreproducto": "Craft"}	{"activo": true, "reglaid": 1, "productoid": 5, "categoriaid": 2, "descripcion": null, "sku_maestro": "AMO-010", "nombreproducto": "Cubo Love Craft", "proveedorid_default": 1}	4	APROBADO	2026-01-03 17:57:58.057706	2026-01-03 17:57:58.057706	4
53	productos	1	UPDATE	{"activo": true, "reglaid": 1, "productoid": 1, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-001", "nombreproducto": "Cubo Colors Love"}	{"activo": true, "reglaid": 1, "productoid": 1, "categoriaid": 2, "descripcion": null, "sku_maestro": "AMO-001", "nombreproducto": "Cubo Colors Love", "proveedorid_default": 1}	4	APROBADO	2026-01-03 18:03:49.232571	2026-01-03 18:03:49.232571	4
54	productos	2	UPDATE	{"activo": true, "reglaid": 1, "productoid": 2, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-003", "nombreproducto": "LV Oro"}	{"activo": true, "reglaid": 1, "productoid": 2, "categoriaid": 2, "descripcion": null, "sku_maestro": "AMO-003", "nombreproducto": "Cubo LV Oro", "proveedorid_default": 1}	4	APROBADO	2026-01-03 18:27:11.516707	2026-01-03 18:27:11.516707	4
55	productos	2	UPDATE	{"activo": true, "reglaid": 1, "productoid": 2, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-003", "nombreproducto": "Cubo LV Oro"}	{"activo": true, "reglaid": 1, "productoid": 2, "categoriaid": 2, "descripcion": null, "sku_maestro": "AMO-003", "nombreproducto": "Cubo LV Oro", "proveedorid_default": 1}	4	APROBADO	2026-01-03 18:28:37.913026	2026-01-03 18:28:37.913026	4
56	productos	9	UPDATE	{"activo": true, "reglaid": 1, "productoid": 9, "categoriaid": 2, "descripcion": "Cubo Acetato", "proveedorid": 1, "sku_maestro": "AMO-018", "nombreproducto": "Cubo Acetato"}	{"activo": true, "reglaid": 1, "productoid": 9, "categoriaid": 2, "descripcion": null, "sku_maestro": "AMO-018", "nombreproducto": "Cubo Acetato", "proveedorid_default": 1}	4	APROBADO	2026-01-03 18:35:39.098118	2026-01-03 18:35:39.098118	4
57	productos	7	UPDATE	{"activo": true, "reglaid": 1, "productoid": 7, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-014", "nombreproducto": "RedBlack"}	{"activo": true, "reglaid": 1, "productoid": 7, "categoriaid": 2, "descripcion": null, "sku_maestro": "AMO-014", "nombreproducto": "Cubo RedBlack Love", "proveedorid_default": 1}	4	APROBADO	2026-01-03 19:08:29.186101	2026-01-03 19:08:29.186101	4
58	productos	6	UPDATE	{"activo": true, "reglaid": 1, "productoid": 6, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-012", "nombreproducto": "Colores"}	{"activo": true, "reglaid": 1, "productoid": 6, "categoriaid": 2, "descripcion": null, "sku_maestro": "AMO-012", "nombreproducto": "Cubo Colores Amor", "proveedorid_default": 1}	4	APROBADO	2026-01-03 19:13:54.91665	2026-01-03 19:13:54.91665	4
59	productos	15	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 15, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-020", "nombreproducto": "Cubo Friends & Love"}	4	APROBADO	2026-01-03 21:20:40.039006	2026-01-03 21:20:40.039006	4
61	categorias	3	UPDATE	{"activo": true, "nombre": "Toda Ocasión", "categoriaid": 3, "descripcion": null, "parentcategoriaid": null}	{"activo": true, "nombre": "Toda Ocasión", "categoriaid": 3, "descripcion": "Cajas de cumpleaños que dan color a tu regalo", "parentcategoriaid": null}	5	APROBADO	2026-01-03 21:32:20.899793	2026-01-03 21:32:20.899793	5
62	categorias	3	UPDATE	{"activo": true, "nombre": "Toda Ocasión", "categoriaid": 3, "descripcion": "Cajas de cumpleaños que dan color a tu regalo", "parentcategoriaid": null}	{"activo": true, "nombre": "Toda Ocasión", "categoriaid": 3, "descripcion": "Cajas de cumpleaños que dan color a tu regalo 🎁", "parentcategoriaid": null}	5	APROBADO	2026-01-03 21:33:25.852562	2026-01-03 21:33:25.852562	5
63	productos	17	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 17, "categoriaid": 3, "descripcion": "Caja craft de colores, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes con acabdo mate.", "proveedorid": 1, "sku_maestro": "TOD-001", "nombreproducto": "Cubo cumple craft"}	5	APROBADO	2026-01-03 21:48:33.399514	2026-01-03 21:48:33.399514	5
64	productos	17	UPDATE	{"activo": true, "reglaid": 1, "productoid": 17, "categoriaid": 3, "descripcion": "Caja craft de colores, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes con acabdo mate.", "proveedorid": 1, "sku_maestro": "TOD-001", "nombreproducto": "Cubo cumple craft"}	{"activo": true, "reglaid": 1, "productoid": 17, "categoriaid": 3, "descripcion": "Caja craft de colores, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes con acabado mate.", "sku_maestro": "TOD-001", "nombreproducto": "Cubo Cumple Craft", "proveedorid_default": 1}	5	APROBADO	2026-01-03 22:01:05.371984	2026-01-03 22:01:05.371984	5
65	productos	17	UPDATE	{"activo": true, "reglaid": 1, "productoid": 17, "categoriaid": 3, "descripcion": "Caja craft de colores, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes con acabado mate.", "proveedorid": 1, "sku_maestro": "TOD-001", "nombreproducto": "Cubo Cumple Craft"}	{"activo": true, "reglaid": 1, "productoid": 17, "categoriaid": 3, "descripcion": "Caja craft de colores, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes con acabado mate.", "sku_maestro": "TOD-001", "nombreproducto": "Cubo Cumple Craft", "proveedorid_default": 1}	5	APROBADO	2026-01-03 23:11:57.313087	2026-01-03 23:11:57.313087	5
66	productos	18	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 18, "categoriaid": 3, "descripcion": "Caja con diseño, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "TOD-002", "nombreproducto": "Cubo Cumple Graffiti"}	5	APROBADO	2026-01-03 23:33:06.059573	2026-01-03 23:33:06.059573	5
67	productos	19	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 19, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-022", "nombreproducto": "Cubo Love"}	4	APROBADO	2026-01-03 23:42:01.833775	2026-01-03 23:42:01.833775	4
68	categorias	2	UPDATE	{"activo": true, "nombre": "Amor", "imagen_url": null, "categoriaid": 2, "descripcion": null, "imagen_public_id": null, "parentcategoriaid": null}	{"activo": true, "nombre": "Amor", "imagen_url": "https://res.cloudinary.com/daylne1ml/image/upload/v1767483819/categories/hxivvedrcy19xk06ugjn.png", "categoriaid": 2, "descripcion": null, "imagen_public_id": "categories/hxivvedrcy19xk06ugjn", "parentcategoriaid": null}	2	APROBADO	2026-01-03 23:43:39.569988	2026-01-03 23:43:39.569988	2
69	productos	20	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 20, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-023", "nombreproducto": "Cubo TQM"}	4	APROBADO	2026-01-03 23:46:45.070513	2026-01-03 23:46:45.070513	4
70	productos	17	UPDATE	{"activo": true, "reglaid": 1, "productoid": 17, "categoriaid": 3, "descripcion": "Caja craft de colores, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes con acabado mate.", "proveedorid": 1, "sku_maestro": "TOD-001", "nombreproducto": "Cubo Cumple Craft"}	{"activo": true, "reglaid": 1, "productoid": 17, "categoriaid": 3, "descripcion": "Caja craft de colores, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes con acabado mate.", "sku_maestro": "TOD-001", "nombreproducto": "Cubo Cumple Craft", "proveedorid_default": 1}	5	APROBADO	2026-01-03 23:48:05.98786	2026-01-03 23:48:05.98786	5
71	productos	17	UPDATE	{"activo": true, "reglaid": 1, "productoid": 17, "categoriaid": 3, "descripcion": "Caja craft de colores, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes con acabado mate.", "proveedorid": 1, "sku_maestro": "TOD-001", "nombreproducto": "Cubo Cumple Craft"}	{"activo": true, "reglaid": 1, "productoid": 17, "categoriaid": 3, "descripcion": "Caja craft de colores, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes con acabado mate.", "sku_maestro": "TOD-001", "nombreproducto": "Cubo Cumple Craft", "proveedorid_default": 1}	5	APROBADO	2026-01-03 23:55:45.712137	2026-01-03 23:55:45.712137	5
72	categorias	3	UPDATE	{"activo": true, "nombre": "Toda Ocasión", "imagen_url": null, "categoriaid": 3, "descripcion": "Cajas de cumpleaños que dan color a tu regalo 🎁", "imagen_public_id": null, "parentcategoriaid": null}	{"activo": true, "nombre": "Toda ocasión", "imagen_url": "https://res.cloudinary.com/daylne1ml/image/upload/v1767484732/categories/mrfszpgqjl4zvot4bei0.png", "categoriaid": 3, "descripcion": "Cajas de cumpleaños que dan color a tu regalo 🎁", "imagen_public_id": "categories/mrfszpgqjl4zvot4bei0", "parentcategoriaid": null}	2	APROBADO	2026-01-03 23:58:53.327293	2026-01-03 23:58:53.327293	2
73	categorias	1	UPDATE	{"activo": true, "nombre": "Lisas", "imagen_url": null, "categoriaid": 1, "descripcion": "Cajas perfectas para cualquier época del año!", "imagen_public_id": null, "parentcategoriaid": null}	{"activo": true, "nombre": "Lisas", "imagen_url": "https://res.cloudinary.com/daylne1ml/image/upload/v1767484774/categories/idyffvrvkmy3o9dmxsuw.png", "categoriaid": 1, "descripcion": "Cajas perfectas para cualquier época del año!", "imagen_public_id": "categories/idyffvrvkmy3o9dmxsuw", "parentcategoriaid": null}	2	APROBADO	2026-01-03 23:59:35.541278	2026-01-03 23:59:35.541278	2
74	categorias	4	UPDATE	{"activo": true, "nombre": "Natural", "imagen_url": null, "categoriaid": 4, "descripcion": null, "imagen_public_id": null, "parentcategoriaid": null}	{"activo": true, "nombre": "Natural", "imagen_url": "https://res.cloudinary.com/daylne1ml/image/upload/v1767484784/categories/t49i7w3jzlrrtvfgj7bw.png", "categoriaid": 4, "descripcion": null, "imagen_public_id": "categories/t49i7w3jzlrrtvfgj7bw", "parentcategoriaid": null}	2	APROBADO	2026-01-03 23:59:45.019098	2026-01-03 23:59:45.019098	2
90	productos	32	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 32, "categoriaid": 3, "descripcion": "Cajas con diseños y frases divertidas, con las marcas de tus tenis favoritos, colores con acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "TOD-013", "nombreproducto": "Cubo Sports"}	5	APROBADO	2026-01-04 02:46:36.211577	2026-01-04 02:46:36.211577	5
75	productos	18	UPDATE	{"activo": true, "reglaid": 1, "productoid": 18, "categoriaid": 3, "descripcion": "Caja con diseño, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "TOD-002", "nombreproducto": "Cubo Cumple Graffiti"}	{"activo": true, "reglaid": 1, "productoid": 18, "categoriaid": 3, "descripcion": "Caja con diseño, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes acabado barniz brillante.", "sku_maestro": "TOD-002", "nombreproducto": "Cubo Cumple Graffiti", "proveedorid_default": 1}	5	APROBADO	2026-01-04 00:06:14.450959	2026-01-04 00:06:14.450959	5
76	productos	2	UPDATE	{"activo": true, "productoid": 2}	{"activo": true, "productoid": 2}	2	APROBADO	2026-01-04 00:16:35.822105	2026-01-04 00:16:35.822105	2
77	productos	21	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 21, "categoriaid": 3, "descripcion": "Caja con diseño, ideal para celebraciones especiales, colores vibrantes con acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "TOD-003", "nombreproducto": "Cubo Cómics"}	5	APROBADO	2026-01-04 00:28:40.120763	2026-01-04 00:28:40.120763	5
78	productos	22	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 22, "categoriaid": 2, "descripcion": "Estas cajas de regalo tipo \\"Camisera\\" son perfectas para quienes buscan un empaque vibrante, alegre y lleno de sentimiento. Su diseño \\"Colors Love\\" destaca por una explosión de colores neón, tipografías estilo pop-art y mensajes románticos que las hacen ideales para San Valentín, aniversarios o cualquier ocasión especial.", "proveedorid": 1, "sku_maestro": "AMO-024", "nombreproducto": "Camisera Colors Love"}	4	APROBADO	2026-01-04 00:35:05.017191	2026-01-04 00:35:05.017191	4
79	productos	23	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 23, "categoriaid": 3, "descripcion": "Caja con diseños divertidos, ideal para esa persona tan especial, colores vibrantes acabado barniz brillante", "proveedorid": 1, "sku_maestro": "TOD-004", "nombreproducto": "Cubo Botana"}	5	APROBADO	2026-01-04 00:39:56.115123	2026-01-04 00:39:56.115123	5
80	productos	22	UPDATE	{"activo": true, "reglaid": 1, "productoid": 22, "categoriaid": 2, "descripcion": "Estas cajas de regalo tipo \\"Camisera\\" son perfectas para quienes buscan un empaque vibrante, alegre y lleno de sentimiento. Su diseño \\"Colors Love\\" destaca por una explosión de colores neón, tipografías estilo pop-art y mensajes románticos que las hacen ideales para San Valentín, aniversarios o cualquier ocasión especial.", "proveedorid": 1, "sku_maestro": "AMO-024", "nombreproducto": "Camisera Colors Love"}	{"activo": true, "reglaid": 1, "productoid": 22, "categoriaid": 2, "descripcion": "Estas cajas de regalo tipo \\"Camisera\\" son perfectas para quienes buscan un empaque vibrante, alegre y lleno de sentimiento. Su diseño \\"Colors Love\\" destaca por una explosión de colores neón, tipografías estilo pop-art y mensajes románticos que las hacen ideales para San Valentín, aniversarios o cualquier ocasión especial.", "sku_maestro": "AMO-024", "nombreproducto": "Camisera Colors Love", "proveedorid_default": 1}	4	APROBADO	2026-01-04 00:42:22.716293	2026-01-04 00:42:22.716293	4
81	productos	24	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 24, "categoriaid": 3, "descripcion": "Caja con diseños espectaculares, felicitaciones increíbles y todo en un solo empaque, colores vibrantes acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "TOD-005", "nombreproducto": "Cubo Felicidades"}	5	APROBADO	2026-01-04 00:53:30.39235	2026-01-04 00:53:30.39235	5
82	productos	18	UPDATE	{"activo": true, "reglaid": 1, "productoid": 18, "categoriaid": 3, "descripcion": "Caja con diseño, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "TOD-002", "nombreproducto": "Cubo Cumple Graffiti"}	{"activo": true, "reglaid": 1, "productoid": 18, "categoriaid": 3, "descripcion": "Caja con diseño, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes acabado barniz brillante.", "sku_maestro": "TOD-002", "nombreproducto": "Cubo Cumple Graffiti", "proveedorid_default": 1}	5	APROBADO	2026-01-04 01:02:48.820168	2026-01-04 01:02:48.820168	5
83	productos	25	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 25, "categoriaid": 3, "descripcion": "Caja de colores, empaques perfectos para tus detalles, diseñadas para convertir un regalo en una experiencia inolvidable, colores espectaculares con acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "TOD-006", "nombreproducto": "Cubo Cumple Colors"}	5	APROBADO	2026-01-04 01:10:36.441724	2026-01-04 01:10:36.441724	5
84	productos	26	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 26, "categoriaid": 3, "descripcion": "Cubo craft, bolas y rayas de colores, ideal para cualquier ocasión, colores sobrios en acabado mate.", "proveedorid": 1, "sku_maestro": "TOD-007", "nombreproducto": "Cubo Bolas y Rayas"}	5	APROBADO	2026-01-04 01:23:01.910872	2026-01-04 01:23:01.910872	5
85	productos	27	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 27, "categoriaid": 3, "descripcion": "Cubo con diseños bonitos y tiernos, para toda ocasión, colores con un toque de dulzura, acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "TOD-008", "nombreproducto": "Cubo Paris-London"}	5	APROBADO	2026-01-04 01:32:43.262065	2026-01-04 01:32:43.262065	5
86	productos	28	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 28, "categoriaid": 3, "descripcion": "Cajas con diseño divertido, ideales para cumpleaños ó cualquier celebración especial, colores explosivos con acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "TOD-009", "nombreproducto": "Cubo Feliz"}	5	APROBADO	2026-01-04 01:43:29.696735	2026-01-04 01:43:29.696735	5
87	productos	29	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 29, "categoriaid": 3, "descripcion": "Caja con diseños de marcas aesthetic, divertidas para cualquier ocasión, con acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "TOD-010", "nombreproducto": "Cubo Nice"}	5	APROBADO	2026-01-04 02:03:19.888578	2026-01-04 02:03:19.888578	5
88	productos	30	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 30, "categoriaid": 3, "descripcion": "Caja, que por su medida es perfecta para un regalo increíble, diseños de cumpleaños para esa persona especial, acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "TOD-011", "nombreproducto": "Cubo Cumple White"}	5	APROBADO	2026-01-04 02:14:44.937414	2026-01-04 02:14:44.937414	5
89	productos	31	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 31, "categoriaid": 3, "descripcion": "Cajas de colores divertidos para toda ocasión, en acabado mate.", "proveedorid": 1, "sku_maestro": "TOD-012", "nombreproducto": "Cubo Luxe"}	5	APROBADO	2026-01-04 02:25:32.467718	2026-01-04 02:25:32.467718	5
91	productos	33	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 33, "categoriaid": 3, "descripcion": "Cajas con diseños y frases divertidas, con marcas de cerveza, ideales para caballero, acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "TOD-014", "nombreproducto": "Cubo Marcas"}	5	APROBADO	2026-01-04 02:52:24.060686	2026-01-04 02:52:24.060686	5
92	productos	34	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 34, "categoriaid": 2, "descripcion": "¡Expresa tus sentimientos con una explosión de color! Nuestra línea Corazón Colors Love está diseñada para quienes buscan un empaque dinámico, moderno y lleno de alegría. Estas cajas no son solo un envoltorio, son parte del regalo mismo.", "proveedorid": 1, "sku_maestro": "AMO-025", "nombreproducto": "Corazón Colors Love"}	4	APROBADO	2026-01-04 02:58:59.151672	2026-01-04 02:58:59.151672	4
93	productos	35	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 35, "categoriaid": 3, "descripcion": "Cajas para toda ocasión, con colores básicos, pero divertidos, acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "TOD-015", "nombreproducto": "Cubo Incógnita"}	5	APROBADO	2026-01-04 03:01:17.007599	2026-01-04 03:01:17.007599	5
94	productos	36	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 36, "categoriaid": 3, "descripcion": "Hermosas cajas, en tonos pastel, para celebrar la llegada de un ser pequeñito  y muy especial, acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "TOD-016", "nombreproducto": "Cubo Baby"}	5	APROBADO	2026-01-04 03:13:07.969117	2026-01-04 03:13:07.969117	5
95	productos	3	UPDATE	{"activo": true, "reglaid": 1, "productoid": 3, "categoriaid": 1, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-006", "nombreproducto": "Brillo"}	{"activo": true, "reglaid": 2, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Brillo", "proveedorid_default": 1}	4	APROBADO	2026-01-04 03:33:24.419971	2026-01-04 03:33:24.419971	4
96	productos	37	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 37, "categoriaid": 2, "descripcion": "Sorprende a esa persona especial con nuestras Torres RedBlack, cajas de regalo premium diseñadas para cautivar. Con un estilo moderno y una combinación vibrante de colores rojo, blanco y negro, estas torres son más que un empaque: son un mensaje de amor por sí mismas.", "proveedorid": 1, "sku_maestro": "TOR-001", "nombreproducto": "Torre RedBlack"}	4	APROBADO	2026-01-04 03:48:08.714171	2026-01-04 03:48:08.714171	4
97	productos	38	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 38, "categoriaid": 2, "descripcion": "Sorprende a esa persona especial con nuestra Torre Love, una caja de regalo decorativa diseñada para cautivar. Con un estilo moderno y vibrante, es el empaque ideal para arreglos florales, dulces, peluches o cualquier sorpresa inolvidable.", "proveedorid": 1, "sku_maestro": "TOR-002", "nombreproducto": "Torre Love"}	4	APROBADO	2026-01-04 03:50:25.035807	2026-01-04 03:50:25.035807	4
98	productos	39	INSERT	\N	{"activo": true, "reglaid": 2, "productoid": 39, "categoriaid": 2, "descripcion": "¡Dale un toque vibrante y lleno de vida a tus detalles! Nuestra línea de Baúles Colors Love está diseñada para quienes no temen expresar sus sentimientos con fuerza y color. Ideales para envolver regalos, guardar recuerdos o decorar espacios con un estilo moderno y dinámico.", "proveedorid": 1, "sku_maestro": "BAU-001", "nombreproducto": "Baúl Colors Love"}	4	APROBADO	2026-01-04 04:07:58.273793	2026-01-04 04:07:58.273793	4
99	productos	40	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 40, "categoriaid": 2, "descripcion": "Estas cajas de regalo tipo \\"cartón de leche\\" son una opción creativa y encantadora para cualquier detalle especial. Su diseño único combina la nostalgia de un envase clásico con mensajes modernos y románticos.", "proveedorid": 1, "sku_maestro": "MIL-001", "nombreproducto": "Milk Love"}	4	APROBADO	2026-01-04 04:18:06.809342	2026-01-04 04:18:06.809342	4
100	productos	38	UPDATE	{"activo": true, "reglaid": 1, "productoid": 38, "categoriaid": 2, "descripcion": "Sorprende a esa persona especial con nuestra Torre Love, una caja de regalo decorativa diseñada para cautivar. Con un estilo moderno y vibrante, es el empaque ideal para arreglos florales, dulces, peluches o cualquier sorpresa inolvidable.", "proveedorid": 1, "sku_maestro": "TOR-002", "nombreproducto": "Torre Love"}	{"activo": true, "reglaid": 1, "productoid": 38, "categoriaid": 2, "descripcion": "Sorprende a esa persona especial con nuestra Torre Love, una caja de regalo decorativa diseñada para cautivar. Con un estilo moderno y vibrante, es el empaque ideal para arreglos florales, dulces, peluches o cualquier sorpresa inolvidable.", "sku_maestro": "TOR-002", "nombreproducto": "Torre Love", "proveedorid_default": 1}	4	APROBADO	2026-01-04 04:28:28.207964	2026-01-04 04:28:28.207964	4
101	productos	9	UPDATE	{"activo": true, "reglaid": 1, "productoid": 9, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-018", "nombreproducto": "Cubo Acetato"}	{"activo": true, "reglaid": 1, "productoid": 9, "categoriaid": 2, "descripcion": "¡Eleva tus regalos al siguiente nivel con nuestros Cubos Corazón de Acetato! Diseñados para combinar elegancia y sentimiento, estos cubos son la base ideal para arreglos florales, desayunos sorpresa, dulces o peluches.", "sku_maestro": "AMO-018", "nombreproducto": "Cubo Acetato", "proveedorid_default": 1}	4	APROBADO	2026-01-04 04:46:05.223944	2026-01-04 04:46:05.223944	4
102	productos	6	UPDATE	{"activo": true, "reglaid": 1, "productoid": 6, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-012", "nombreproducto": "Cubo Colores Amor"}	{"activo": true, "reglaid": 1, "productoid": 6, "categoriaid": 2, "descripcion": "¡Haz que cada detalle cuente! Nuestra colección Colores Amor está diseñada para quienes buscan transformar un simple regalo en una experiencia inolvidable. Estas cajas no son solo empaques, son una declaración de afecto con un diseño vibrante y moderno.", "sku_maestro": "AMO-012", "nombreproducto": "Cubo Colores Amor", "proveedorid_default": 1}	4	APROBADO	2026-01-04 04:47:54.413547	2026-01-04 04:47:54.413547	4
113	productos	20	UPDATE	{"activo": true, "reglaid": 1, "productoid": 20, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-023", "nombreproducto": "Cubo TQM"}	{"activo": true, "reglaid": 1, "productoid": 20, "categoriaid": 2, "descripcion": "El Cubo TQM es una caja de regalo premium que combina un diseño moderno con mensajes sentimentales. Su forma cúbica y compacta la hace ideal para contener joyería, dulces finos, lociones o pequeños detalles significativos.", "sku_maestro": "AMO-023", "nombreproducto": "Cubo TQM", "proveedorid_default": 1}	4	APROBADO	2026-01-04 04:58:30.150167	2026-01-04 04:58:30.150167	4
103	productos	6	UPDATE	{"activo": true, "reglaid": 1, "productoid": 6, "categoriaid": 2, "descripcion": "¡Haz que cada detalle cuente! Nuestra colección Colores Amor está diseñada para quienes buscan transformar un simple regalo en una experiencia inolvidable. Estas cajas no son solo empaques, son una declaración de afecto con un diseño vibrante y moderno.", "proveedorid": 1, "sku_maestro": "AMO-012", "nombreproducto": "Cubo Colores Amor"}	{"activo": true, "reglaid": 1, "productoid": 6, "categoriaid": 2, "descripcion": "¡Haz que cada detalle cuente! Nuestra colección Colores Amor está diseñada para quienes buscan transformar un simple regalo en una experiencia inolvidable. Estas cajas no son solo empaques, son una declaración de afecto con un diseño vibrante y moderno.", "sku_maestro": "AMO-012", "nombreproducto": "Cubo Colores Amor", "proveedorid_default": 1}	4	APROBADO	2026-01-04 04:48:46.268383	2026-01-04 04:48:46.268383	4
104	productos	1	UPDATE	{"activo": true, "reglaid": 1, "productoid": 1, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-001", "nombreproducto": "Cubo Colors Love"}	{"activo": true, "reglaid": 1, "productoid": 1, "categoriaid": 2, "descripcion": "Dale un toque de color y alegría a tus detalles con nuestro Cubo Colors Love. Diseñado especialmente para quienes no temen expresar su cariño de forma vibrante, este cubo decorativo es mucho más que una caja: es el complemento ideal que hará que tu regalo destaque desde el primer momento.", "sku_maestro": "AMO-001", "nombreproducto": "Cubo Colors Love", "proveedorid_default": 1}	4	APROBADO	2026-01-04 04:50:03.960348	2026-01-04 04:50:03.960348	4
105	productos	15	UPDATE	{"activo": true, "reglaid": 1, "productoid": 15, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-020", "nombreproducto": "Cubo Friends & Love"}	{"activo": true, "reglaid": 1, "productoid": 15, "categoriaid": 2, "descripcion": "¡Haz que tu regalo destaque desde el primer momento! Nuestra colección Friends & Love combina un diseño urbano tipo graffiti con mensajes llenos de sentimiento, perfectos para cualquier ocasión especial.", "sku_maestro": "AMO-020", "nombreproducto": "Cubo Friends & Love", "proveedorid_default": 1}	4	APROBADO	2026-01-04 04:51:12.411405	2026-01-04 04:51:12.411405	4
106	productos	8	UPDATE	{"activo": true, "reglaid": 2, "productoid": 8, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-016", "nombreproducto": "Cubo Hecho en México"}	{"activo": true, "reglaid": 1, "productoid": 8, "categoriaid": 2, "descripcion": "Dale un toque auténtico y vibrante a tus detalles con nuestras cajas de regalo temáticas. Diseñadas con el icónico sello de \\"Hecho en México\\", estas cajas no solo sirven como empaque, sino como un elemento decorativo de alta calidad que resalta el orgullo nacional.", "sku_maestro": "AMO-016", "nombreproducto": "Cubo Hecho en México", "proveedorid_default": 1}	4	APROBADO	2026-01-04 04:52:00.860716	2026-01-04 04:52:00.860716	4
107	productos	19	UPDATE	{"activo": true, "reglaid": 1, "productoid": 19, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-022", "nombreproducto": "Cubo Love"}	{"activo": true, "reglaid": 1, "productoid": 19, "categoriaid": 2, "descripcion": "¡Haz que cada momento especial sea inolvidable! Nuestro Cubo LOVE no es solo una caja, es una experiencia diseñada para expresar tus sentimientos de la forma más creativa y elegante.", "sku_maestro": "AMO-022", "nombreproducto": "Cubo Love", "proveedorid_default": 1}	4	APROBADO	2026-01-04 04:52:56.576323	2026-01-04 04:52:56.576323	4
108	productos	4	UPDATE	{"activo": true, "reglaid": 1, "productoid": 4, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-008", "nombreproducto": "Cubo Love Black"}	{"activo": true, "reglaid": 1, "productoid": 4, "categoriaid": 2, "descripcion": "El Cubo Love Black es la opción perfecta para quienes buscan un empaque impactante, moderno y lleno de sentimiento. Diseñada con un fondo negro profundo que hace resaltar colores vibrantes, esta caja no es solo un empaque, sino parte del regalo mismo.", "sku_maestro": "AMO-008", "nombreproducto": "Cubo Love Black", "proveedorid_default": 1}	4	APROBADO	2026-01-04 04:54:05.780054	2026-01-04 04:54:05.780054	4
109	productos	5	UPDATE	{"activo": true, "reglaid": 1, "productoid": 5, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-010", "nombreproducto": "Cubo Love Craft"}	{"activo": true, "reglaid": 1, "productoid": 5, "categoriaid": 2, "descripcion": "¡Haz que cada regalo sea inolvidable desde el primer vistazo! Nuestra línea de cajas Love Craft está diseñada para quienes buscan salir de lo convencional y entregar un detalle lleno de color, arte y emoción.", "sku_maestro": "AMO-010", "nombreproducto": "Cubo Love Craft", "proveedorid_default": 1}	4	APROBADO	2026-01-04 04:54:51.657231	2026-01-04 04:54:51.657231	4
110	productos	2	UPDATE	{"activo": true, "reglaid": 1, "productoid": 2, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-003", "nombreproducto": "Cubo LV Oro"}	{"activo": true, "reglaid": 1, "productoid": 2, "categoriaid": 2, "descripcion": "Eleva la presentación de tus detalles con nuestra exclusiva línea de Cajas Cubo LV Oro. Diseñadas con un elegante acabado en color oro y tipografía estilizada, estas cajas son perfectas para San Valentín, aniversarios o cualquier ocasión especial donde el amor sea el protagonista.", "sku_maestro": "AMO-003", "nombreproducto": "Cubo LV Oro", "proveedorid_default": 1}	4	APROBADO	2026-01-04 04:56:02.400255	2026-01-04 04:56:02.400255	4
111	productos	16	UPDATE	{"activo": true, "reglaid": 1, "productoid": 16, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-021", "nombreproducto": "Cubo Novios Guapos"}	{"activo": true, "reglaid": 1, "productoid": 16, "categoriaid": 2, "descripcion": "¡Lleva tu regalo al siguiente nivel con nuestras cajas decorativas de la línea Novios Guapos! Diseñadas con colores neón, tipografías estilo graffiti y mensajes llenos de amor, estas cajas no son solo un empaque, son parte de la sorpresa.", "sku_maestro": "AMO-021", "nombreproducto": "Cubo Novios Guapos", "proveedorid_default": 1}	4	APROBADO	2026-01-04 04:56:52.472804	2026-01-04 04:56:52.472804	4
112	productos	7	UPDATE	{"activo": true, "reglaid": 1, "productoid": 7, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-014", "nombreproducto": "Cubo RedBlack Love"}	{"activo": true, "reglaid": 1, "productoid": 7, "categoriaid": 2, "descripcion": "Sorprende a esa persona especial con nuestros elegantes cubos decorativos de la colección RedBlack Love. Diseñados con una combinación clásica de rojo, negro y blanco, estos cubos son el empaque perfecto para regalos inolvidables o como un detalle decorativo lleno de sentimiento.", "sku_maestro": "AMO-014", "nombreproducto": "Cubo RedBlack Love", "proveedorid_default": 1}	4	APROBADO	2026-01-04 04:57:37.585851	2026-01-04 04:57:37.585851	4
114	productos	10	UPDATE	{"activo": true, "reglaid": 5, "productoid": 10, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-019", "nombreproducto": "Libreta"}	{"activo": true, "reglaid": 5, "productoid": 10, "categoriaid": 2, "descripcion": "¡Dale estilo a tus notas con estas libretas de diseño exclusivo! Perfectas para regalo o para uso personal, estas libretas combinan un diseño moderno con materiales de alta resistencia.", "sku_maestro": "AMO-019", "nombreproducto": "Libreta", "proveedorid_default": 1}	4	APROBADO	2026-01-04 05:00:01.850146	2026-01-04 05:00:01.850146	4
115	productos	41	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 41, "categoriaid": 3, "descripcion": "Cajas para caballero toda ocasión, diseños sobrios para festejar a esa persona especial, acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "CUB-001", "nombreproducto": "Cubo Pesca y Cacería"}	5	APROBADO	2026-01-04 05:19:32.525278	2026-01-04 05:19:32.525278	5
116	productos	42	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 42, "categoriaid": 3, "descripcion": "Caja con colores fascinantes, que harán de tu regalo una experiencia única, diseños coloridos para esa celebración especial, en acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "CAM-001", "nombreproducto": "Camisera Grande Cumple"}	5	APROBADO	2026-01-04 13:14:25.899296	2026-01-04 13:14:25.899296	5
117	productos	42	UPDATE	{"activo": true, "reglaid": 1, "productoid": 42, "categoriaid": 3, "descripcion": "Caja con colores fascinantes, que harán de tu regalo una experiencia única, diseños coloridos para esa celebración especial, en acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "CAM-001", "nombreproducto": "Camisera Grande Cumple"}	{"activo": true, "reglaid": 1, "productoid": 42, "categoriaid": 3, "descripcion": "Caja con colores fascinantes, que harán de tu regalo una experiencia única, diseños coloridos para esa celebración especial, en acabado barniz brillante.", "sku_maestro": "CAM-001", "nombreproducto": "Camisera Cumple", "proveedorid_default": 1}	5	APROBADO	2026-01-04 13:24:45.71658	2026-01-04 13:24:45.71658	5
118	productos	42	UPDATE	{"activo": true, "reglaid": 1, "productoid": 42, "categoriaid": 3, "descripcion": "Caja con colores fascinantes, que harán de tu regalo una experiencia única, diseños coloridos para esa celebración especial, en acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "CAM-001", "nombreproducto": "Camisera Cumple"}	{"activo": true, "reglaid": 1, "productoid": 42, "categoriaid": 3, "descripcion": "Caja con colores fascinantes, que harán de tu regalo una experiencia única, diseños coloridos para esa celebración especial, en acabado barniz brillante.", "sku_maestro": "CAM-001", "nombreproducto": "Camisera Cumple", "proveedorid_default": 1}	2	APROBADO	2026-01-04 18:13:54.433485	2026-01-04 18:13:54.433485	2
119	productos	42	UPDATE	{"activo": true, "reglaid": 1, "productoid": 42, "categoriaid": 3, "descripcion": "Caja con colores fascinantes, que harán de tu regalo una experiencia única, diseños coloridos para esa celebración especial, en acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "CAM-001", "nombreproducto": "Camisera Cumple"}	{"activo": true, "reglaid": 1, "productoid": 42, "categoriaid": 3, "descripcion": "Caja con colores fascinantes, que harán de tu regalo una experiencia única, diseños coloridos para esa celebración especial, en acabado barniz brillante.", "sku_maestro": "CAM-001", "nombreproducto": "Camisera Cumple", "proveedorid_default": 1}	5	APROBADO	2026-01-04 19:21:52.400226	2026-01-04 19:21:52.400226	5
120	productos	43	INSERT	\N	{"activo": true, "reglaid": 5, "productoid": 43, "categoriaid": 3, "descripcion": "Caja con colores intensos, ideal para cualquier ocasión, hotstampin, acabado mate.", "proveedorid": 1, "sku_maestro": "PAS-001", "nombreproducto": "Pastelera De Luxe"}	5	APROBADO	2026-01-04 19:43:54.498723	2026-01-04 19:43:54.498723	5
121	productos	44	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 44, "categoriaid": 4, "descripcion": "Caja de regalo kraft natural 10 x 10 cm, simple y bonita. Ideal para envolver detalles pequeños con un toque natural y moderno. Resistente, práctica y fácil de personalizar.", "proveedorid": 1, "sku_maestro": "CAJ-001", "nombreproducto": "Caja cubo 10x10"}	7	APROBADO	2026-01-04 21:56:20.938851	2026-01-04 21:56:20.938851	7
122	productos	44	UPDATE	{"activo": true, "reglaid": 1, "productoid": 44, "categoriaid": 4, "descripcion": "Caja de regalo kraft natural 10 x 10 cm, simple y bonita. Ideal para envolver detalles pequeños con un toque natural y moderno. Resistente, práctica y fácil de personalizar.", "proveedorid": 1, "sku_maestro": "CAJ-001", "nombreproducto": "Caja cubo 10x10"}	{"activo": true, "reglaid": 1, "productoid": 44, "categoriaid": 4, "descripcion": "Caja de regalo kraft natural 10 x 10 cm, simple y bonita. Ideal para envolver detalles pequeños con un toque natural y moderno. Resistente, práctica y fácil de personalizar.", "sku_maestro": "CAJ-001", "nombreproducto": "Caja cubo 10x10", "proveedorid_default": 1}	7	APROBADO	2026-01-04 21:58:16.910759	2026-01-04 21:58:16.910759	7
123	productos	44	UPDATE	{"activo": true, "reglaid": 1, "productoid": 44, "categoriaid": 4, "descripcion": "Caja de regalo kraft natural 10 x 10 cm, simple y bonita. Ideal para envolver detalles pequeños con un toque natural y moderno. Resistente, práctica y fácil de personalizar.", "proveedorid": 1, "sku_maestro": "CAJ-001", "nombreproducto": "Caja cubo 10x10"}	{"activo": true, "reglaid": 1, "productoid": 44, "categoriaid": 4, "descripcion": "Caja de regalo kraft natural tipo cubo, simple, bonita y con mucho estilo. Ideal para presentar tus detalles con un look natural y moderno. Resistente, práctica y fácil de personalizar. Disponible en tamaños desde 10 x 10 x 10 cm hasta 65 x 65 x 65 cm ✨🎁", "sku_maestro": "CAJ-001", "nombreproducto": "Caja cubo", "proveedorid_default": 1}	7	APROBADO	2026-01-04 22:01:21.583169	2026-01-04 22:01:21.583169	7
124	productos	44	UPDATE	{"activo": true, "reglaid": 1, "productoid": 44, "categoriaid": 4, "descripcion": "Caja de regalo kraft natural tipo cubo, simple, bonita y con mucho estilo. Ideal para presentar tus detalles con un look natural y moderno. Resistente, práctica y fácil de personalizar. Disponible en tamaños desde 10 x 10 x 10 cm hasta 65 x 65 x 65 cm ✨🎁", "proveedorid": 1, "sku_maestro": "CAJ-001", "nombreproducto": "Caja cubo"}	{"activo": true, "reglaid": 1, "productoid": 44, "categoriaid": 4, "descripcion": "Caja de regalo kraft natural tipo cubo, simple, bonita y con mucho estilo. Ideal para presentar tus detalles con un look natural y moderno. Resistente, práctica y fácil de personalizar. Disponible en tamaños desde 10 x 10 x 10 cm hasta 65 x 65 x 65 cm ✨🎁", "sku_maestro": "CAJ-001", "nombreproducto": "Caja cubo", "proveedorid_default": 1}	7	APROBADO	2026-01-04 22:07:36.550678	2026-01-04 22:07:36.550678	7
125	productos	45	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 45, "categoriaid": 4, "descripcion": "Caja camisera de regalo kraft color natural, elegante y funcional. Ideal para presentar prendas y regalos con un estilo limpio y moderno. Resistente, práctica y fácil de personalizar. Disponible en diferentes tamaños para adaptarse a cada detalle 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-002", "nombreproducto": "Caja camisera"}	7	APROBADO	2026-01-04 22:10:51.299318	2026-01-04 22:10:51.299318	7
126	productos	46	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 46, "categoriaid": 4, "descripcion": "Caja baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-003", "nombreproducto": "Caja baul"}	7	APROBADO	2026-01-04 22:14:39.015287	2026-01-04 22:14:39.015287	7
127	productos	47	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 47, "categoriaid": 3, "descripcion": "Caja para celebrar a esa persona especial, color, diseño y tamaño perfecto para un regalo espectacular, con acabado barniz brillante", "proveedorid": 1, "sku_maestro": "BAU-002", "nombreproducto": "Baúl Cumple"}	5	APROBADO	2026-01-04 22:15:48.777274	2026-01-04 22:15:48.777274	5
128	productos	13	UPDATE	{"activo": true, "reglaid": 1, "productoid": 13, "categoriaid": 4, "descripcion": null, "proveedorid": 1, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural"}	{"activo": true, "reglaid": 1, "productoid": 13, "categoriaid": 4, "descripcion": "Caja camisera de regalo kraft color natural, elegante y funcional. Ideal para presentar prendas y regalos con un estilo limpio y moderno. Resistente, práctica y fácil de personalizar. Disponible en diferentes tamaños para adaptarse a cada detalle 🎁✨", "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural", "proveedorid_default": 1}	7	APROBADO	2026-01-04 22:17:44.600314	2026-01-04 22:17:44.600314	7
129	productos	48	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 48, "categoriaid": 4, "descripcion": "Caja tipo lunch kraft natural, práctica y con mucho estilo. Ideal para armar desayunos sorpresa y detalles especiales. Resistente, fácil de armar y perfecta para personalizar y sorprender 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-004", "nombreproducto": "Caja lunch kraft"}	7	APROBADO	2026-01-04 22:20:08.881175	2026-01-04 22:20:08.881175	7
130	productos	49	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 49, "categoriaid": 4, "descripcion": "Caja de regalo tipo torre kraft, original y llamativa. Ideal para armar regalos en capas y crear una presentación impactante. Resistente, fácil de armar y perfecta para personalizar con un estilo natural y moderno 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-005", "nombreproducto": "Caja torre natural"}	7	APROBADO	2026-01-04 22:23:05.031916	2026-01-04 22:23:05.031916	7
131	productos	50	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 50, "categoriaid": 3, "descripcion": "Caja para celebrar a esa persona especial, color, diseño y tamaño perfecto para un regalo espectacular, con acabado barniz brillante", "proveedorid": 1, "sku_maestro": "BAU-003", "nombreproducto": "Baúl Colors Cumple"}	5	APROBADO	2026-01-04 22:24:01.818454	2026-01-04 22:24:01.818454	5
132	productos	51	INSERT	\N	{"activo": true, "reglaid": 2, "productoid": 51, "categoriaid": 4, "descripcion": "Caja six pack kraft natural, perfecta para cervezas o bebidas. Resistente, con estilo y ese look natural que siempre queda bien. Ideal para armar regalos cool y sorprender 🍺✨", "proveedorid": 1, "sku_maestro": "SIX-001", "nombreproducto": "Six pack natural"}	7	APROBADO	2026-01-04 22:30:13.875708	2026-01-04 22:30:13.875708	7
133	productos	52	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 52, "categoriaid": 4, "descripcion": "Caja de regalo en forma de corazón, elaborada en cartón kraft natural. Bonita, resistente y con un toque romántico y moderno. Ideal para detalles especiales, fácil de personalizar y perfecta para sorprender 💛🎁", "proveedorid": 1, "sku_maestro": "CAJ-006", "nombreproducto": "Caja corazon natural"}	7	APROBADO	2026-01-04 22:33:15.169906	2026-01-04 22:33:15.169906	7
134	productos	53	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 53, "categoriaid": 3, "descripcion": "Caja para celebrar a esa persona especial, ideal para un desayuno sorpresa ó si lo prefieres retiras el interior y colocas tu regalo, color, diseño y tamaño perfecto, con acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "LUN-001", "nombreproducto": "Lunch Party"}	5	APROBADO	2026-01-04 22:34:17.923262	2026-01-04 22:34:17.923262	5
135	productos	54	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 54, "categoriaid": 3, "descripcion": "Caja para celebrar a esa persona especial, color, diseño y tamaño perfecto para un regalo espectacular, con acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "TOR-003", "nombreproducto": "Torre Cumple Colors"}	5	APROBADO	2026-01-04 22:55:01.231357	2026-01-04 22:55:01.231357	5
136	productos	55	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 55, "categoriaid": 3, "descripcion": "Caja para celebrar a esa persona especial, color, diseño y tamaño perfecto para una botella de vino, con acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "BOT-001", "nombreproducto": "Botella Cumple"}	5	APROBADO	2026-01-04 23:06:53.641059	2026-01-04 23:06:53.641059	5
137	productos	56	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 56, "categoriaid": 3, "descripcion": "Caja para celebrar a esa persona especial, diseño divertido y tamaño perfecto para un regalo espectacular, con acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "PAL-001", "nombreproducto": "Palomita"}	5	APROBADO	2026-01-04 23:12:58.654783	2026-01-04 23:12:58.654783	5
138	productos	57	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 57, "categoriaid": 3, "descripcion": "Caja con diseño divertido, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "MIL-002", "nombreproducto": "Milk Cumple Colors"}	5	APROBADO	2026-01-04 23:59:53.437413	2026-01-04 23:59:53.437413	5
139	productos	58	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 58, "categoriaid": 3, "descripcion": "Caja con diseños divertidos, perfecta para cervezas ó bebidas, resistente, con estilo y ese look que siempre queda bien. Ideal para armar regalos cool y sorprender, acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "SIX-002", "nombreproducto": "Six Pack Men"}	5	APROBADO	2026-01-05 00:30:01.777644	2026-01-05 00:30:01.777644	5
140	productos	59	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 59, "categoriaid": 3, "descripcion": "Caja con un diseño original y funcional. Perfecta para entregar regalos especiales con un toque moderno y divertido. Resistente, fácil de armar, con asas, acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "CER-001", "nombreproducto": "Cerillo Party"}	5	APROBADO	2026-01-05 04:48:32.969775	2026-01-05 04:48:32.969775	5
141	productos	60	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 60, "categoriaid": 3, "descripcion": "Bolsa Kraft de material resistente, con diseños únicos, ideal para sorprender a esa persona especial, acabado mate.", "proveedorid": 1, "sku_maestro": "BOL-001", "nombreproducto": "Bolsa Guapos"}	5	APROBADO	2026-01-05 05:05:37.351594	2026-01-05 05:05:37.351594	5
142	productos	61	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 61, "categoriaid": 3, "descripcion": "Sobre de dinero, ideal para cuando no sabes que regalar, diseños alegres y divertidos, con acabado barniz brillante.", "proveedorid": 1, "sku_maestro": "SOB-001", "nombreproducto": "Sobre Cumple"}	5	APROBADO	2026-01-05 05:28:54.66734	2026-01-05 05:28:54.66734	5
143	productos	14	UPDATE	{"activo": true, "reglaid": 1, "productoid": 14, "categoriaid": 1, "descripcion": null, "proveedorid": 1, "sku_maestro": "LIS-002", "nombreproducto": "Línea Metalizada"}	{"activo": true, "reglaid": 1, "productoid": 14, "categoriaid": 1, "descripcion": null, "sku_maestro": "LIS-002", "nombreproducto": "Línea Metalizada", "proveedorid_default": 1}	2	APROBADO	2026-01-05 05:38:48.391989	2026-01-05 05:38:48.391989	2
144	productos	46	UPDATE	{"activo": true, "reglaid": 1, "productoid": 46, "categoriaid": 4, "descripcion": "Caja baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-003", "nombreproducto": "Caja baul"}	{"activo": true, "reglaid": 1, "productoid": 46, "categoriaid": 4, "descripcion": "Caja baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨", "sku_maestro": "CAJ-003", "nombreproducto": "Caja baul", "proveedorid_default": 1}	7	APROBADO	2026-01-05 19:20:47.345742	2026-01-05 19:20:47.345742	7
145	productos	45	UPDATE	{"activo": true, "reglaid": 1, "productoid": 45, "categoriaid": 4, "descripcion": "Caja camisera de regalo kraft color natural, elegante y funcional. Ideal para presentar prendas y regalos con un estilo limpio y moderno. Resistente, práctica y fácil de personalizar. Disponible en diferentes tamaños para adaptarse a cada detalle 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-002", "nombreproducto": "Caja camisera"}	{"activo": true, "reglaid": 1, "productoid": 45, "categoriaid": 4, "descripcion": "Camisera de regalo kraft color natural, elegante y funcional. Ideal para presentar prendas y regalos con un estilo limpio y moderno. Resistente, práctica y fácil de personalizar. Disponible en diferentes tamaños para adaptarse a cada detalle 🎁✨", "sku_maestro": "CAJ-002", "nombreproducto": "Caja camisera", "proveedorid_default": 1}	7	APROBADO	2026-01-05 19:22:06.208084	2026-01-05 19:22:06.208084	7
146	productos	46	UPDATE	{"activo": true, "reglaid": 1, "productoid": 46, "categoriaid": 4, "descripcion": "Caja baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-003", "nombreproducto": "Caja baul"}	{"activo": true, "reglaid": 1, "productoid": 46, "categoriaid": 4, "descripcion": "Baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨", "sku_maestro": "CAJ-003", "nombreproducto": "Caja baul", "proveedorid_default": 1}	7	APROBADO	2026-01-05 19:22:29.216803	2026-01-05 19:22:29.216803	7
147	productos	44	UPDATE	{"activo": true, "reglaid": 1, "productoid": 44, "categoriaid": 4, "descripcion": "Caja de regalo kraft natural tipo cubo, simple, bonita y con mucho estilo. Ideal para presentar tus detalles con un look natural y moderno. Resistente, práctica y fácil de personalizar. Disponible en tamaños desde 10 x 10 x 10 cm hasta 65 x 65 x 65 cm ✨🎁", "proveedorid": 1, "sku_maestro": "CAJ-001", "nombreproducto": "Caja cubo"}	{"activo": true, "reglaid": 1, "productoid": 44, "categoriaid": 4, "descripcion": "Cubo kraft natural, simple, bonita y con mucho estilo. Ideal para presentar tus detalles con un look natural y moderno. Resistente, práctica y fácil de personalizar. Disponible en tamaños desde 10 x 10 x 10 cm hasta 65 x 65 x 65 cm ✨🎁", "sku_maestro": "CAJ-001", "nombreproducto": "Caja cubo", "proveedorid_default": 1}	7	APROBADO	2026-01-05 19:24:13.920061	2026-01-05 19:24:13.920061	7
148	productos	51	UPDATE	{"activo": true, "reglaid": 2, "productoid": 51, "categoriaid": 4, "descripcion": "Caja six pack kraft natural, perfecta para cervezas o bebidas. Resistente, con estilo y ese look natural que siempre queda bien. Ideal para armar regalos cool y sorprender 🍺✨", "proveedorid": 1, "sku_maestro": "SIX-001", "nombreproducto": "Six pack natural"}	{"activo": true, "reglaid": 1, "productoid": 51, "categoriaid": 4, "descripcion": "Six pack kraft natural, perfecta para cervezas o bebidas. Resistente, con estilo y ese look natural que siempre queda bien. Ideal para armar regalos cool y sorprender 🍺✨", "sku_maestro": "SIX-001", "nombreproducto": "Six pack natural", "proveedorid_default": 1}	7	APROBADO	2026-01-05 19:25:16.852431	2026-01-05 19:25:16.852431	7
149	productos	62	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 62, "categoriaid": 1, "descripcion": "Dale a tus regalos el empaque que merecen con nuestra línea de cajas pasteleras. Diseñadas para combinar resistencia, estilo y practicidad, estas cajas son ideales para regalos especiales.", "proveedorid": 1, "sku_maestro": "PAS-002", "nombreproducto": "Pastelera Toda Ocasión"}	4	APROBADO	2026-01-05 21:44:09.257478	2026-01-05 21:44:09.257478	4
150	productos	63	INSERT	\N	{"activo": true, "reglaid": 2, "productoid": 63, "categoriaid": 1, "descripcion": "¡Dale un toque de elegancia y ternura a tus detalles! Esta hermosa caja con forma de corazón en colores rosa, lila, rojo y negro, es la opción perfecta para empaques de San Valentín, aniversarios, cumpleaños o cualquier ocasión especial. Su acabado liso y minimalista permite que el regalo sea el verdadero protagonista.", "proveedorid": 1, "sku_maestro": "COR-001", "nombreproducto": "Corazón Liso"}	4	APROBADO	2026-01-05 22:42:21.260266	2026-01-05 22:42:21.260266	4
186	productos	50	UPDATE	{"activo": true, "reglaid": 1, "productoid": 50, "categoriaid": 3, "descripcion": "Caja para celebrar a esa persona especial, color, diseño y tamaño perfecto para un regalo espectacular, con acabado barniz brillante", "proveedorid": 1, "sku_maestro": "BAU-003", "nombreproducto": "Baúl Colors Cumple"}	{"activo": true, "reglaid": 1, "productoid": 50, "categoriaid": 3, "descripcion": "Caja para celebrar a esa persona especial, color, diseño y tamaño perfecto para un regalo espectacular, con acabado barniz brillante", "sku_maestro": "BAU-003", "nombreproducto": "Baúl Colors", "proveedorid_default": 1}	2	APROBADO	2026-01-08 01:10:47.495876	2026-01-08 01:10:47.495876	2
151	productos	34	UPDATE	{"activo": true, "reglaid": 1, "productoid": 34, "categoriaid": 2, "descripcion": "¡Expresa tus sentimientos con una explosión de color! Nuestra línea Corazón Colors Love está diseñada para quienes buscan un empaque dinámico, moderno y lleno de alegría. Estas cajas no son solo un envoltorio, son parte del regalo mismo.", "proveedorid": 1, "sku_maestro": "AMO-025", "nombreproducto": "Corazón Colors Love"}	{"activo": true, "reglaid": 1, "productoid": 34, "categoriaid": 2, "descripcion": "¡Expresa tus sentimientos con una explosión de color! Nuestra línea Corazón Colors Love está diseñada para quienes buscan un empaque dinámico, moderno y lleno de alegría. Estas cajas no son solo un envoltorio, son parte del regalo mismo.", "sku_maestro": "AMO-025", "nombreproducto": "Corazón Colors Love", "proveedorid_default": 1}	4	APROBADO	2026-01-05 22:57:42.399531	2026-01-05 22:57:42.399531	4
152	productos	64	INSERT	\N	{"activo": true, "reglaid": 2, "productoid": 64, "categoriaid": 1, "descripcion": "Eleva la presentación de tus arreglos florales con nuestras cajas exclusivas. Diseñadas específicamente para proteger y resaltar la belleza de las rosas, estas cajas en colores magenta, rosa, lila, rojo y negro,  son la opción perfecta para San Valentín, aniversarios o cualquier ocasión especial.", "proveedorid": 1, "sku_maestro": "CAJ-006", "nombreproducto": "Caja para Rosas"}	4	APROBADO	2026-01-05 23:15:31.257044	2026-01-05 23:15:31.257044	4
153	productos	64	UPDATE	{"activo": true, "reglaid": 2, "productoid": 64, "categoriaid": 1, "descripcion": "Eleva la presentación de tus arreglos florales con nuestras cajas exclusivas. Diseñadas específicamente para proteger y resaltar la belleza de las rosas, estas cajas en colores magenta, rosa, lila, rojo y negro,  son la opción perfecta para San Valentín, aniversarios o cualquier ocasión especial.", "proveedorid": 1, "sku_maestro": "CAJ-006", "nombreproducto": "Caja para Rosas"}	{"activo": true, "reglaid": 2, "productoid": 64, "categoriaid": 1, "descripcion": "Eleva la presentación de tus arreglos florales con nuestras cajas exclusivas. Diseñadas específicamente para proteger y resaltar la belleza de las rosas, estas cajas en colores magenta, rosa, lila, rojo y negro,  son la opción perfecta para San Valentín, aniversarios o cualquier ocasión especial.", "sku_maestro": "CAJ-006", "nombreproducto": "Caja para Rosas", "proveedorid_default": 1}	4	APROBADO	2026-01-06 04:25:11.845515	2026-01-06 04:25:11.845515	4
154	productos	65	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 65, "categoriaid": 1, "descripcion": "Dale un toque vibrante y profesional a tus regalos con nuestras cajas tipo \\"milk box\\". Ahora con un acabado mejorado en barniz, estas cajas no solo lucen increíbles, sino que ofrecen una textura premium y mayor durabilidad.", "proveedorid": 1, "sku_maestro": "MIL-003", "nombreproducto": "Milk Lisa Colores"}	4	APROBADO	2026-01-06 04:37:09.896437	2026-01-06 04:37:09.896437	4
155	productos	66	INSERT	\N	{"activo": true, "reglaid": 1, "productoid": 66, "categoriaid": 1, "descripcion": "Dale a tus regalos una presentación inolvidable con nuestra Cajabolsa, el híbrido perfecto entre una caja resistente y una bolsa práctica. Este modelo destaca por su vibrante color rojo y un acabado de alta calidad diseñado para sorprender.", "proveedorid": 1, "sku_maestro": "CAJ-007", "nombreproducto": "Caja Bolsa"}	4	APROBADO	2026-01-06 04:38:59.992287	2026-01-06 04:38:59.992287	4
156	productos	67	INSERT	\N	{"activo": true, "reglaid": null, "productoid": 67, "categoriaid": 1, "descripcion": "¡Dale un toque de color y estilo a tus entregas! Estas bolsas de color son ideales para quienes buscan resistencia y una presentación impecable. Su diseño vibrante y moderno las hace perfectas para boutiques, papelerías o eventos especiales.", "proveedorid": 1, "sku_maestro": "BOL-002", "nombreproducto": "Bolsa Boutique Colores"}	4	APROBADO	2026-01-06 04:42:48.36018	2026-01-06 04:42:48.36018	4
157	agentes	2	INSERT	\N	{"email": "jofegara.78@gmail.com", "activo": true, "nombre": "José", "esadmin": false, "adminrol": null, "agenteid": 2, "apellido": "García", "codigoagente": "AG0002"}	4	APROBADO	2026-01-06 04:55:41.470809	2026-01-06 04:55:41.470809	4
158	productos	3	UPDATE	{"activo": true, "reglaid": 2, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "proveedorid": 1, "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Brillo"}	{"activo": true, "reglaid": 2, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Brillo", "proveedorid_default": 1}	4	APROBADO	2026-01-06 05:43:09.801925	2026-01-06 05:43:09.801925	4
159	productos	3	UPDATE	{"activo": true, "reglaid": 2, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "proveedorid": 1, "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Brillo"}	{"activo": true, "reglaid": 2, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Brillo", "proveedorid_default": 1}	4	APROBADO	2026-01-06 05:46:41.779808	2026-01-06 05:46:41.779808	4
160	productos	3	UPDATE	{"activo": true, "reglaid": 2, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "proveedorid": 1, "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Brillo"}	{"activo": true, "reglaid": 2, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Brillo", "proveedorid_default": 1}	4	APROBADO	2026-01-06 05:47:46.005621	2026-01-06 05:47:46.005621	4
161	productos	3	UPDATE	{"activo": true, "reglaid": 2, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "proveedorid": 1, "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Brillo"}	{"activo": true, "reglaid": 2, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Brillo", "proveedorid_default": 1}	4	APROBADO	2026-01-06 05:48:39.014008	2026-01-06 05:48:39.014008	4
162	productos	3	UPDATE	{"activo": true, "reglaid": 2, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "proveedorid": 1, "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Brillo"}	{"activo": true, "reglaid": 1, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Bri", "proveedorid_default": 1}	2	APROBADO	2026-01-06 05:49:50.591563	2026-01-06 05:49:50.591563	2
163	productos	3	UPDATE	{"activo": true, "reglaid": 1, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "proveedorid": 1, "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Bri"}	{"activo": true, "reglaid": 1, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Brillo", "proveedorid_default": 1}	2	APROBADO	2026-01-06 05:50:09.747911	2026-01-06 05:50:09.747911	2
164	productos	3	UPDATE	{"activo": true, "reglaid": 1, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "proveedorid": 1, "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Brillo"}	{"activo": true, "reglaid": 2, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Brillo", "proveedorid_default": 1}	2	APROBADO	2026-01-06 05:51:16.96787	2026-01-06 05:51:16.96787	2
165	productos	3	UPDATE	{"activo": true, "reglaid": 2, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "proveedorid": 1, "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Brillo"}	{"activo": true, "reglaid": 2, "productoid": 3, "categoriaid": 1, "descripcion": "Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.", "sku_maestro": "AMO-006", "nombreproducto": "Cubo Liso Brillo", "proveedorid_default": 1}	4	APROBADO	2026-01-06 05:53:20.948703	2026-01-06 05:53:20.948703	4
166	productos	67	UPDATE	{"activo": true, "reglaid": null, "productoid": 67, "categoriaid": 1, "descripcion": "¡Dale un toque de color y estilo a tus entregas! Estas bolsas de color son ideales para quienes buscan resistencia y una presentación impecable. Su diseño vibrante y moderno las hace perfectas para boutiques, papelerías o eventos especiales.", "proveedorid": 1, "sku_maestro": "BOL-002", "nombreproducto": "Bolsa Boutique Colores"}	{"activo": true, "reglaid": null, "productoid": 67, "categoriaid": 1, "descripcion": "¡Dale un toque de color y estilo a tus entregas! Estas bolsas de color son ideales para quienes buscan resistencia y una presentación impecable. Su diseño vibrante y moderno las hace perfectas para boutiques, papelerías o eventos especiales.", "sku_maestro": "BOL-002", "nombreproducto": "Bolsa Boutique Colores", "proveedorid_default": 1}	4	APROBADO	2026-01-06 06:13:31.356954	2026-01-06 06:13:31.356954	4
167	productos	67	UPDATE	{"activo": true, "reglaid": null, "productoid": 67, "categoriaid": 1, "descripcion": "¡Dale un toque de color y estilo a tus entregas! Estas bolsas de color son ideales para quienes buscan resistencia y una presentación impecable. Su diseño vibrante y moderno las hace perfectas para boutiques, papelerías o eventos especiales.", "proveedorid": 1, "sku_maestro": "BOL-002", "nombreproducto": "Bolsa Boutique Colores"}	{"activo": true, "reglaid": 1, "productoid": 67, "categoriaid": 1, "descripcion": "¡Dale un toque de color y estilo a tus entregas! Estas bolsas de color son ideales para quienes buscan resistencia y una presentación impecable. Su diseño vibrante y moderno las hace perfectas para boutiques, papelerías o eventos especiales.", "sku_maestro": "BOL-002", "nombreproducto": "Bolsa Boutique Colores", "proveedorid_default": 1}	4	APROBADO	2026-01-06 06:17:45.483564	2026-01-06 06:17:45.483564	4
176	productos	48	UPDATE	{"activo": true, "reglaid": 1, "productoid": 48, "categoriaid": 4, "descripcion": "Caja tipo lunch kraft natural, práctica y con mucho estilo. Ideal para armar desayunos sorpresa y detalles especiales. Resistente, fácil de armar y perfecta para personalizar y sorprender 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-004", "nombreproducto": "Caja lunch kraft"}	{"activo": true, "reglaid": 1, "productoid": 48, "categoriaid": 4, "descripcion": "Caja tipo lunch kraft natural, práctica y con mucho estilo. Ideal para armar desayunos sorpresa y detalles especiales. Resistente, fácil de armar y perfecta para personalizar y sorprender 🎁✨", "sku_maestro": "CAJ-004", "nombreproducto": "Lunch Natural", "proveedorid_default": 1}	4	APROBADO	2026-01-06 07:21:27.225091	2026-01-06 07:21:27.225091	4
168	productos	39	UPDATE	{"activo": true, "reglaid": 2, "productoid": 39, "categoriaid": 2, "descripcion": "¡Dale un toque vibrante y lleno de vida a tus detalles! Nuestra línea de Baúles Colors Love está diseñada para quienes no temen expresar sus sentimientos con fuerza y color. Ideales para envolver regalos, guardar recuerdos o decorar espacios con un estilo moderno y dinámico.", "proveedorid": 1, "sku_maestro": "BAU-001", "nombreproducto": "Baúl Colors Love"}	{"activo": true, "reglaid": 1, "productoid": 39, "categoriaid": 2, "descripcion": "¡Dale un toque vibrante y lleno de vida a tus detalles! Nuestra línea de Baúles Colors Love está diseñada para quienes no temen expresar sus sentimientos con fuerza y color. Ideales para envolver regalos, guardar recuerdos o decorar espacios con un estilo moderno y dinámico.", "sku_maestro": "BAU-001", "nombreproducto": "Baúl Colors Love", "proveedorid_default": 1}	4	APROBADO	2026-01-06 06:40:00.539096	2026-01-06 06:40:00.539096	4
169	productos	43	UPDATE	{"activo": true, "reglaid": 5, "productoid": 43, "categoriaid": 3, "descripcion": "Caja con colores intensos, ideal para cualquier ocasión, hotstampin, acabado mate.", "proveedorid": 1, "sku_maestro": "PAS-001", "nombreproducto": "Pastelera De Luxe"}	{"activo": true, "reglaid": 1, "productoid": 43, "categoriaid": 3, "descripcion": "Caja con colores intensos, ideal para cualquier ocasión, hotstampin, acabado mate.", "sku_maestro": "PAS-001", "nombreproducto": "Pastelera De Luxe", "proveedorid_default": 1}	4	APROBADO	2026-01-06 06:47:28.176135	2026-01-06 06:47:28.176135	4
170	productos	46	UPDATE	{"activo": true, "reglaid": 1, "productoid": 46, "categoriaid": 4, "descripcion": "Baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-003", "nombreproducto": "Caja baul"}	{"activo": true, "reglaid": 1, "productoid": 46, "categoriaid": 4, "descripcion": "Baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨", "sku_maestro": "CAJ-003", "nombreproducto": "Baúl Natural", "proveedorid_default": 1}	5	APROBADO	2026-01-06 07:01:02.533405	2026-01-06 07:01:02.533405	5
171	productos	46	UPDATE	{"activo": true, "reglaid": 1, "productoid": 46, "categoriaid": 4, "descripcion": "Baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-003", "nombreproducto": "Baúl Natural"}	{"activo": true, "reglaid": 1, "productoid": 46, "categoriaid": 4, "descripcion": "Baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨", "sku_maestro": "CAJ-003", "nombreproducto": "Baúl Natural", "proveedorid_default": 1}	5	APROBADO	2026-01-06 07:07:01.703903	2026-01-06 07:07:01.703903	5
172	productos	46	UPDATE	{"activo": true, "reglaid": 1, "productoid": 46, "categoriaid": 4, "descripcion": "Baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-003", "nombreproducto": "Baúl Natural"}	{"activo": true, "reglaid": 1, "productoid": 46, "categoriaid": 4, "descripcion": "Baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨", "sku_maestro": "CAJ-003", "nombreproducto": "Baúl Natural", "proveedorid_default": 1}	4	APROBADO	2026-01-06 07:08:39.064796	2026-01-06 07:08:39.064796	4
173	productos	46	UPDATE	{"activo": true, "reglaid": 1, "productoid": 46, "categoriaid": 4, "descripcion": "Baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-003", "nombreproducto": "Baúl Natural"}	{"activo": true, "reglaid": 1, "productoid": 46, "categoriaid": 4, "descripcion": "Baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨", "sku_maestro": "CAJ-003", "nombreproducto": "Baúl Natural", "proveedorid_default": 1}	4	APROBADO	2026-01-06 07:09:42.459039	2026-01-06 07:09:42.459039	4
174	productos	44	UPDATE	{"activo": true, "reglaid": 1, "productoid": 44, "categoriaid": 4, "descripcion": "Cubo kraft natural, simple, bonita y con mucho estilo. Ideal para presentar tus detalles con un look natural y moderno. Resistente, práctica y fácil de personalizar. Disponible en tamaños desde 10 x 10 x 10 cm hasta 65 x 65 x 65 cm ✨🎁", "proveedorid": 1, "sku_maestro": "CAJ-001", "nombreproducto": "Caja cubo"}	{"activo": true, "reglaid": 1, "productoid": 44, "categoriaid": 4, "descripcion": "Cubo kraft natural, simple, bonita y con mucho estilo. Ideal para presentar tus detalles con un look natural y moderno. Resistente, práctica y fácil de personalizar. Disponible en tamaños desde 10 x 10 x 10 cm hasta 65 x 65 x 65 cm ✨🎁", "sku_maestro": "CAJ-001", "nombreproducto": "Cubo Natural", "proveedorid_default": 1}	4	APROBADO	2026-01-06 07:14:36.638619	2026-01-06 07:14:36.638619	4
175	productos	44	UPDATE	{"activo": true, "reglaid": 1, "productoid": 44, "categoriaid": 4, "descripcion": "Cubo kraft natural, simple, bonita y con mucho estilo. Ideal para presentar tus detalles con un look natural y moderno. Resistente, práctica y fácil de personalizar. Disponible en tamaños desde 10 x 10 x 10 cm hasta 65 x 65 x 65 cm ✨🎁", "proveedorid": 1, "sku_maestro": "CAJ-001", "nombreproducto": "Cubo Natural"}	{"activo": true, "reglaid": 1, "productoid": 44, "categoriaid": 4, "descripcion": "Cubo kraft natural, simple, bonita y con mucho estilo. Ideal para presentar tus detalles con un look natural y moderno. Resistente, práctica y fácil de personalizar. Disponible en tamaños desde 10 x 10 x 10 cm hasta 65 x 65 x 65 cm ✨🎁", "sku_maestro": "CAJ-001", "nombreproducto": "Cubo Natural", "proveedorid_default": 1}	4	APROBADO	2026-01-06 07:15:58.338953	2026-01-06 07:15:58.338953	4
177	productos	49	UPDATE	{"activo": true, "reglaid": 1, "productoid": 49, "categoriaid": 4, "descripcion": "Caja de regalo tipo torre kraft, original y llamativa. Ideal para armar regalos en capas y crear una presentación impactante. Resistente, fácil de armar y perfecta para personalizar con un estilo natural y moderno 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-005", "nombreproducto": "Caja torre natural"}	{"activo": true, "reglaid": 1, "productoid": 49, "categoriaid": 4, "descripcion": "Caja de regalo tipo torre kraft, original y llamativa. Ideal para armar regalos en capas y crear una presentación impactante. Resistente, fácil de armar y perfecta para personalizar con un estilo natural y moderno 🎁✨", "sku_maestro": "CAJ-005", "nombreproducto": "Torre Natural", "proveedorid_default": 1}	4	APROBADO	2026-01-06 07:23:42.474727	2026-01-06 07:23:42.474727	4
178	productos	49	UPDATE	{"activo": true, "reglaid": 1, "productoid": 49, "categoriaid": 4, "descripcion": "Caja de regalo tipo torre kraft, original y llamativa. Ideal para armar regalos en capas y crear una presentación impactante. Resistente, fácil de armar y perfecta para personalizar con un estilo natural y moderno 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-005", "nombreproducto": "Torre Natural"}	{"activo": true, "reglaid": 1, "productoid": 49, "categoriaid": 4, "descripcion": "Caja de regalo tipo torre kraft, original y llamativa. Ideal para armar regalos en capas y crear una presentación impactante. Resistente, fácil de armar y perfecta para personalizar con un estilo natural y moderno 🎁✨", "sku_maestro": "CAJ-005", "nombreproducto": "Torre Natural", "proveedorid_default": 1}	4	APROBADO	2026-01-06 07:24:15.210238	2026-01-06 07:24:15.210238	4
179	productos	51	UPDATE	{"activo": true, "reglaid": 1, "productoid": 51, "categoriaid": 4, "descripcion": "Six pack kraft natural, perfecta para cervezas o bebidas. Resistente, con estilo y ese look natural que siempre queda bien. Ideal para armar regalos cool y sorprender 🍺✨", "proveedorid": 1, "sku_maestro": "SIX-001", "nombreproducto": "Six pack natural"}	{"activo": true, "reglaid": 1, "productoid": 51, "categoriaid": 4, "descripcion": "Six pack kraft natural, perfecta para cervezas o bebidas. Resistente, con estilo y ese look natural que siempre queda bien. Ideal para armar regalos cool y sorprender 🍺✨", "sku_maestro": "SIX-001", "nombreproducto": "Sixpack Natural", "proveedorid_default": 1}	4	APROBADO	2026-01-06 07:29:32.945352	2026-01-06 07:29:32.945352	4
180	productos	51	UPDATE	{"activo": true, "reglaid": 1, "productoid": 51, "categoriaid": 4, "descripcion": "Six pack kraft natural, perfecta para cervezas o bebidas. Resistente, con estilo y ese look natural que siempre queda bien. Ideal para armar regalos cool y sorprender 🍺✨", "proveedorid": 1, "sku_maestro": "SIX-001", "nombreproducto": "Sixpack Natural"}	{"activo": true, "reglaid": 1, "productoid": 51, "categoriaid": 4, "descripcion": "Six pack kraft natural, perfecta para cervezas o bebidas. Resistente, con estilo y ese look natural que siempre queda bien. Ideal para armar regalos cool y sorprender 🍺✨", "sku_maestro": "SIX-001", "nombreproducto": "Six Pack Natural", "proveedorid_default": 1}	4	APROBADO	2026-01-06 07:29:55.847825	2026-01-06 07:29:55.847825	4
181	productos	13	UPDATE	{"activo": true, "reglaid": 1, "productoid": 13, "categoriaid": 4, "descripcion": "Caja camisera de regalo kraft color natural, elegante y funcional. Ideal para presentar prendas y regalos con un estilo limpio y moderno. Resistente, práctica y fácil de personalizar. Disponible en diferentes tamaños para adaptarse a cada detalle 🎁✨", "proveedorid": 1, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural"}	{"activo": true, "reglaid": 1, "productoid": 13, "categoriaid": 4, "descripcion": "Camisera de regalo natural, elegante y funcional. Ideal para presentar prendas y regalos con un estilo limpio y moderno. Resistente, práctica y fácil de personalizar. Disponible en diferentes tamaños para adaptarse a cada detalle 🎁✨", "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural", "proveedorid_default": 1}	7	APROBADO	2026-01-06 18:20:13.192577	2026-01-06 18:20:13.192577	7
182	productos	48	UPDATE	{"activo": true, "reglaid": 1, "productoid": 48, "categoriaid": 4, "descripcion": "Caja tipo lunch kraft natural, práctica y con mucho estilo. Ideal para armar desayunos sorpresa y detalles especiales. Resistente, fácil de armar y perfecta para personalizar y sorprender 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-004", "nombreproducto": "Lunch Natural"}	{"activo": true, "reglaid": 1, "productoid": 48, "categoriaid": 4, "descripcion": "Caja tipo lunch kraft natural, práctica y con mucho estilo. Ideal para armar desayunos sorpresa y detalles especiales. Resistente, fácil de armar y perfecta para personalizar y sorprender 🎁✨", "sku_maestro": "CAJ-004", "nombreproducto": "Lunch Natural", "proveedorid_default": 1}	7	APROBADO	2026-01-06 18:25:45.403717	2026-01-06 18:25:45.403717	7
183	productos	46	UPDATE	{"activo": true, "reglaid": 1, "productoid": 46, "categoriaid": 4, "descripcion": "Baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨", "proveedorid": 1, "sku_maestro": "CAJ-003", "nombreproducto": "Baúl Natural"}	{"activo": true, "reglaid": 1, "productoid": 46, "categoriaid": 4, "descripcion": "Caja baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨", "sku_maestro": "CAJ-003", "nombreproducto": "Baúl Natural", "proveedorid_default": 1}	7	APROBADO	2026-01-06 18:27:37.855563	2026-01-06 18:27:37.855563	7
184	productos	13	UPDATE	{"activo": true, "reglaid": 1, "productoid": 13, "categoriaid": 4, "descripcion": "Camisera de regalo natural, elegante y funcional. Ideal para presentar prendas y regalos con un estilo limpio y moderno. Resistente, práctica y fácil de personalizar. Disponible en diferentes tamaños para adaptarse a cada detalle 🎁✨", "proveedorid": 1, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural"}	{"activo": true, "reglaid": 1, "productoid": 13, "categoriaid": 4, "descripcion": "Caja camisera de regalo natural, elegante y funcional. Ideal para presentar prendas y regalos con un estilo limpio y moderno. Resistente, práctica y fácil de personalizar. Disponible en diferentes tamaños para adaptarse a cada detalle 🎁✨", "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural", "proveedorid_default": 1}	7	APROBADO	2026-01-06 18:28:58.864888	2026-01-06 18:28:58.864888	7
185	productos	11	UPDATE	{"activo": true, "reglaid": 2, "productoid": 11, "categoriaid": 1, "descripcion": null, "proveedorid": 1, "sku_maestro": "LIS-001", "nombreproducto": "Cubo Liso"}	{"activo": true, "reglaid": 1, "productoid": 11, "categoriaid": 1, "descripcion": null, "sku_maestro": "LIS-001", "nombreproducto": "Cubo Liso", "proveedorid_default": 1}	5	APROBADO	2026-01-07 00:52:36.983021	2026-01-07 00:52:36.983021	5
187	productos	50	UPDATE	{"activo": true, "reglaid": 1, "productoid": 50, "categoriaid": 3, "descripcion": "Caja para celebrar a esa persona especial, color, diseño y tamaño perfecto para un regalo espectacular, con acabado barniz brillante", "proveedorid": 1, "sku_maestro": "BAU-003", "nombreproducto": "Baúl Colors"}	{"activo": true, "reglaid": 1, "productoid": 50, "categoriaid": 3, "descripcion": "Caja para celebrar a esa persona especial, color, diseño y tamaño perfecto para un regalo espectacular, con acabado barniz brillante", "sku_maestro": "BAU-003", "nombreproducto": "Baúl Colors Cumple", "proveedorid_default": 1}	2	APROBADO	2026-01-08 01:11:06.583567	2026-01-08 01:11:06.583567	2
188	producto_variantes	168	UPDATE	{"sku": "PAL-001-30X50-GRANDE", "campo": "Dimensiones", "productoId": 56, "varianteId": 168, "medidaNombre": null, "valorAnterior": "30x50"}	{"sku": "PAL-001-30X50-GRANDE", "campo": "Dimensiones", "productoId": 56, "valorNuevo": "Grande", "varianteId": 168, "descripcion": "Producto [56] - Variante [SKU: PAL-001-30X50-GRANDE]: Cambio en Dimensiones de '30x50' a 'Grande'"}	5	APROBADO	2026-01-08 02:02:38.444425	2026-01-08 02:02:38.444425	5
189	producto_variantes	168	UPDATE	{"sku": "PAL-001-30X50-GRANDE", "campo": "Color", "productoId": 56, "varianteId": 168, "medidaNombre": null, "valorAnterior": "Grande"}	{"sku": "PAL-001-30X50-GRANDE", "campo": "Color", "productoId": 56, "valorNuevo": "Sin color", "varianteId": 168, "descripcion": "Producto [56] - Variante [SKU: PAL-001-30X50-GRANDE]: Cambio en Color de 'Grande' a 'Sin color'"}	5	APROBADO	2026-01-08 02:02:38.444425	2026-01-08 02:02:38.444425	5
\.


--
-- TOC entry 4853 (class 0 OID 25110)
-- Dependencies: 249
-- Data for Name: credito_movimientos; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.credito_movimientos (movimiento_id, credito_id, tipo_movimiento, monto, referencia_id, descripcion, fecha_movimiento, saldo_despues_movimiento, registrado_por, admin_id, agente_id) FROM stdin;
\.


--
-- TOC entry 4855 (class 0 OID 25117)
-- Dependencies: 251
-- Data for Name: cuentas_por_cobrar; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.cuentas_por_cobrar (cxcid, pedido_id, cliente_id, tipo_movimiento, monto, descripcion, fecha_movimiento) FROM stdin;
\.


--
-- TOC entry 4857 (class 0 OID 25122)
-- Dependencies: 253
-- Data for Name: cuentas_por_pagar; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.cuentas_por_pagar (cxp_id, proveedor_id, orden_compra_id, fecha_emision, fecha_vencimiento, monto_total, monto_pagado, estatus, referencia_factura, comprobante_pago, notas, usuario_creador_id, monto_original, fecha_cierre, exportado_en, reporte_id) FROM stdin;
\.


--
-- TOC entry 4915 (class 0 OID 25893)
-- Dependencies: 313
-- Data for Name: cupones; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.cupones (cuponid, codigo, descripcion, tipo_descuento, valor, fecha_inicio, fecha_fin, uso_maximo, usos_actuales, activo, monto_minimo_compra, agente_id) FROM stdin;
\.


--
-- TOC entry 4859 (class 0 OID 25135)
-- Dependencies: 255
-- Data for Name: cxp_etiquetas_asignadas; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.cxp_etiquetas_asignadas (asignacion_id, cxp_id, etiqueta_id, fecha_asignacion) FROM stdin;
\.


--
-- TOC entry 4861 (class 0 OID 25140)
-- Dependencies: 257
-- Data for Name: datos_bancarios_empresa; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.datos_bancarios_empresa (id, banco, numero_cuenta, clabe, titular, ultima_actualizacion, es_principal) FROM stdin;
2	PRUEBA	21321321323112	123132131231231232	Prueba 1	2025-12-26 17:22:59.337362	t
\.


--
-- TOC entry 4863 (class 0 OID 25146)
-- Dependencies: 259
-- Data for Name: detallesdelpedido; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) FROM stdin;
\.


--
-- TOC entry 4865 (class 0 OID 25153)
-- Dependencies: 261
-- Data for Name: detallesordencompra; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) FROM stdin;
1	1	40	4	0	12	13.93	0
2	1	41	5	0	12	20.93	0
3	1	42	2	0	12	32.13	0
4	1	6	5	0	6	13.23	0
5	1	115	5	0	6	20.93	0
6	1	116	3	0	6	27.93	0
7	1	118	3	0	6	34.93	0
8	1	120	3	0	6	41.93	0
9	1	122	1	0	6	76.93	0
10	1	7	5	0	6	13.23	0
11	1	117	5	0	6	20.93	0
12	1	43	5	0	6	27.93	0
13	1	44	5	0	6	34.93	0
14	1	119	5	0	6	41.93	0
15	1	121	2	0	6	76.93	0
16	1	123	1	0	6	97.93	0
17	1	177	1	0	12	27.90	0
18	1	178	1	0	12	32.13	0
19	1	179	1	0	12	38.43	0
20	1	180	1	0	12	62.93	0
21	1	182	2	0	6	27.93	0
22	1	184	2	0	6	27.93	0
23	1	186	2	0	6	27.93	0
24	1	181	2	0	6	41.93	0
25	1	183	2	0	6	41.93	0
26	1	185	2	0	6	41.93	0
27	1	204	2	0	6	41.93	0
28	1	198	3	0	12	20.93	0
29	1	199	3	0	12	27.93	0
30	1	200	3	0	12	34.93	0
31	1	203	3	0	12	27.93	0
32	1	102	2	0	12	27.93	0
33	1	103	2	0	12	34.93	0
34	1	104	2	0	12	41.93	0
35	1	112	1	0	12	27.93	0
36	1	113	1	0	12	34.93	0
37	1	114	1	0	12	41.93	0
38	1	107	1	0	12	34.93	0
39	1	106	1	0	12	27.93	0
40	1	154	1	0	12	45.43	0
41	1	158	1	0	12	69.93	0
42	1	165	1	0	12	48.93	0
43	1	166	1	0	12	69.93	0
44	1	65	2	0	12	27.93	0
45	1	66	2	0	12	34.93	0
46	1	67	2	0	12	41.93	0
47	1	82	3	0	12	13.23	0
48	1	85	1	0	12	41.93	0
49	1	73	3	0	12	13.23	0
50	1	70	3	0	12	20.93	0
51	1	58	3	0	12	41.93	0
52	1	15	3	0	12	34.93	0
53	1	14	3	0	12	27.93	0
54	1	10	3	0	12	13.23	0
55	1	11	3	0	12	27.93	0
56	1	51	3	0	12	34.93	0
57	1	52	3	0	12	41.93	0
58	1	8	3	0	12	20.93	0
59	1	9	3	0	12	27.93	0
60	1	47	3	0	12	34.93	0
61	1	48	3	0	12	41.93	0
62	1	49	1	0	12	76.93	0
63	1	3	3	0	12	20.93	0
64	1	4	2	0	12	27.93	0
65	1	5	2	0	12	34.93	0
66	1	56	2	0	12	41.93	0
67	1	57	1	0	12	76.93	0
68	1	12	1	0	12	27.93	0
69	1	13	1	0	12	34.93	0
70	1	59	1	0	12	41.93	0
71	1	1	3	0	12	27.93	0
72	1	2	3	0	12	34.93	0
73	1	53	3	0	12	41.93	0
74	1	54	1	0	12	76.93	0
75	1	55	1	0	12	97.93	0
76	1	77	2	0	12	34.93	0
77	1	78	1	0	12	48.93	0
78	1	175	2	0	12	27.93	0
79	1	176	2	0	12	41.93	0
80	1	205	1	0	12	45.43	0
81	1	206	1	0	12	69.93	0
82	1	136	1	0	12	34.93	0
83	1	137	1	0	12	39.13	0
84	1	138	1	0	12	45.43	0
85	1	139	1	0	12	69.93	0
86	1	88	2	0	12	41.93	0
87	1	140	3	0	12	10.43	0
88	1	141	5	0	12	13.23	0
89	1	142	4	0	12	17.43	0
90	1	143	5	0	12	20.93	0
91	1	144	5	0	12	27.93	0
92	1	151	1	0	12	32.13	0
93	1	152	1	0	12	41.93	0
94	1	159	1	0	12	34.93	0
95	1	160	1	0	12	48.93	0
96	1	161	1	0	12	104.93	0
\.


--
-- TOC entry 4923 (class 0 OID 26155)
-- Dependencies: 321
-- Data for Name: developers; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.developers (dev_id, username, password_hash, created_at) FROM stdin;
2	ferram_dev	$2b$12$mW4.cDyV7xdvOn6z0fzzS.990Qcg2iDURbHk5uL/QHVDCSzi8Ud56	2026-01-08 00:18:36.057612
\.


--
-- TOC entry 4868 (class 0 OID 25179)
-- Dependencies: 265
-- Data for Name: estados; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.estados (estadoid, nombre, abreviatura) FROM stdin;
1	Aguascalientes	AGS
2	Baja California	BC
3	Baja California Sur	BCS
4	Campeche	CAM
5	Chiapas	CHS
6	Chihuahua	CHH
7	Ciudad de México	CDMX
8	Coahuila	COA
9	Colima	COL
10	Durango	DGO
11	Guanajuato	GTO
12	Guerrero	GRO
13	Hidalgo	HGO
14	Jalisco	JAL
15	México	MEX
16	Michoacán	MCH
17	Morelos	MOR
18	Nayarit	NAY
19	Nuevo León	NL
20	Oaxaca	OAX
21	Puebla	PUE
22	Querétaro	QRO
23	Quintana Roo	QTR
24	San Luis Potosí	SLP
25	Sinaloa	SIN
26	Sonora	SON
27	Tabasco	TAB
28	Tamaulipas	TMS
29	Tlaxcala	TLX
30	Veracruz	VER
31	Yucatán	YUC
32	Zacatecas	ZAC
\.


--
-- TOC entry 4917 (class 0 OID 25938)
-- Dependencies: 315
-- Data for Name: inventarios_admin; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.inventarios_admin (inventario_id, admin_id, variante_id, cantidad, ultima_actualizacion, registrado_por) FROM stdin;
\.


--
-- TOC entry 4870 (class 0 OID 25183)
-- Dependencies: 267
-- Data for Name: itemsdelcarrito; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.itemsdelcarrito (itemid, carritoid, varianteid, cantidadpaquetes, tamanoid, cantidad) FROM stdin;
1	2	205	1	4	1
\.


--
-- TOC entry 4919 (class 0 OID 26114)
-- Dependencies: 317
-- Data for Name: landing_page_config; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.landing_page_config (config_id, section_key, content_type, value_draft, value_published, metadata, created_at, updated_at) FROM stdin;
1	hero_slide_1_image	image_url	\N	https://images.unsplash.com/photo-1513885535751-8b9238bd345a?w=1600&h=900&fit=crop	{"order": 1}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
2	hero_slide_1_eyebrow	text	\N	Ofertas Especiales	{"order": 1}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
3	hero_slide_1_title	text	\N	Hasta 40% OFF	{"order": 1}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
4	hero_slide_1_description	text	\N	Descuentos increíbles en productos seleccionados	{"order": 1}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
5	hero_slide_1_cta_text	text	\N	Ver Ofertas	{"order": 1}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
6	hero_slide_1_cta_link	text	\N	/catalogo.html?oferta=true	{"order": 1}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
7	hero_slide_2_image	image_url	\N	https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=1600&h=900&fit=crop	{"order": 2}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
8	hero_slide_2_eyebrow	text	\N	Nuevos Productos	{"order": 2}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
9	hero_slide_2_title	text	\N	Recién Llegados	{"order": 2}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
10	hero_slide_2_description	text	\N	Descubre las últimas novedades en nuestro catálogo	{"order": 2}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
11	hero_slide_2_cta_text	text	\N	Explorar Novedades	{"order": 2}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
12	hero_slide_2_cta_link	text	\N	/catalogo.html?sort=newest	{"order": 2}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
13	hero_slide_3_image	image_url	\N	https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=1600&h=900&fit=crop	{"order": 3}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
14	hero_slide_3_eyebrow	text	\N	Catálogo Completo	{"order": 3}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
15	hero_slide_3_title	text	\N	Productos Premium	{"order": 3}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
16	hero_slide_3_description	text	\N	La mejor calidad para tu negocio	{"order": 3}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
17	hero_slide_3_cta_text	text	\N	Ver Catálogo	{"order": 3}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
18	hero_slide_3_cta_link	text	\N	/catalogo.html	{"order": 3}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
19	section_ofertas_category	category_id	\N	\N	{"label": "Ofertas Relámpago", "section": "ofertas"}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
20	section_nuevos_category	category_id	\N	\N	{"label": "Nuevos Productos", "section": "nuevos"}	2026-01-06 04:25:50.079105	2026-01-06 04:25:50.079105
32	inicio_hero_slide_2_cta_link	text	\N	/catalogo.html?sort=newest	{"page": "inicio", "slide": 2}	2026-01-06 05:04:55.674988	2026-01-06 18:26:53.102695
38	inicio_hero_slide_3_cta_link	text	\N	/catalogo.html	{"page": "inicio", "slide": 3}	2026-01-06 05:04:55.674988	2026-01-06 18:26:53.102695
36	inicio_hero_slide_3_description	text	Productos de alta calidad para tu negocio	Productos de alta calidad para tu negocio	{"page": "inicio", "slide": 3}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
35	inicio_hero_slide_3_title	text	Los Mejores Productos	Los Mejores Productos	{"page": "inicio", "slide": 3}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
37	inicio_hero_slide_3_cta_text	text	Ver Catálogo	Ver Catálogo	{"page": "inicio", "slide": 3}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
41	index_hero_slide_1_image	image_url	\N	https://images.unsplash.com/photo-1607083206325-caf1edba7a0f?w=1600&h=900&fit=crop	{"page": "index", "slide": 1}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
42	index_hero_slide_1_eyebrow	text	\N	Bienvenido a RazoConnect	{"page": "index", "slide": 1}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
43	index_hero_slide_1_title	text	\N	Tu Proveedor de Confianza	{"page": "index", "slide": 1}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
44	index_hero_slide_1_description	text	\N	Productos de calidad para hacer crecer tu negocio	{"page": "index", "slide": 1}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
45	index_hero_slide_1_cta_text	text	\N	Conocer Más	{"page": "index", "slide": 1}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
46	index_hero_slide_1_cta_link	text	\N	/registro.html	{"page": "index", "slide": 1}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
47	index_hero_slide_2_image	image_url	\N	https://images.unsplash.com/photo-1556740758-90de374c12ad?w=1600&h=900&fit=crop	{"page": "index", "slide": 2}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
48	index_hero_slide_2_eyebrow	text	\N	Catálogo Completo	{"page": "index", "slide": 2}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
49	index_hero_slide_2_title	text	\N	Miles de Productos	{"page": "index", "slide": 2}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
50	index_hero_slide_2_description	text	\N	Encuentra todo lo que necesitas en un solo lugar	{"page": "index", "slide": 2}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
51	index_hero_slide_2_cta_text	text	\N	Ver Catálogo	{"page": "index", "slide": 2}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
52	index_hero_slide_2_cta_link	text	\N	/registro.html	{"page": "index", "slide": 2}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
53	index_hero_slide_3_image	image_url	\N	https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1600&h=900&fit=crop	{"page": "index", "slide": 3}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
54	index_hero_slide_3_eyebrow	text	\N	Únete Hoy	{"page": "index", "slide": 3}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
55	index_hero_slide_3_title	text	\N	Comienza a Vender	{"page": "index", "slide": 3}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
56	index_hero_slide_3_description	text	\N	Regístrate y accede a precios especiales	{"page": "index", "slide": 3}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
57	index_hero_slide_3_cta_text	text	\N	Registrarse	{"page": "index", "slide": 3}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
58	index_hero_slide_3_cta_link	text	\N	/registro.html	{"page": "index", "slide": 3}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
59	index_section_destacados_category	category_id	\N	\N	{"page": "index", "label": "Productos Destacados", "section": "featured"}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
60	index_section_populares_category	category_id	\N	\N	{"page": "index", "label": "Más Populares", "section": "popular"}	2026-01-06 05:04:55.674988	2026-01-06 05:04:55.674988
21	inicio_hero_slide_1_image	image_url	https://res.cloudinary.com/daylne1ml/image/upload/v1767689552/razoconnect/landing/ksfhinlh8dpqtrx8vsg8.jpg	https://res.cloudinary.com/daylne1ml/image/upload/v1767689552/razoconnect/landing/ksfhinlh8dpqtrx8vsg8.jpg	{"page": "inicio", "slide": 1}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
26	inicio_hero_slide_1_cta_link	text	\N	/catalogo.html?oferta=true	{"page": "inicio", "slide": 1}	2026-01-06 05:04:55.674988	2026-01-06 18:26:53.102695
22	inicio_hero_slide_1_eyebrow	text	Ofertas	Ofertas	{"page": "inicio", "slide": 1}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
23	inicio_hero_slide_1_title	text	Hasta 40% OFF	Hasta 40% OFF	{"page": "inicio", "slide": 1}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
24	inicio_hero_slide_1_description	text	Descuentos increíbles en productos seleccionados	Descuentos increíbles en productos seleccionados	{"page": "inicio", "slide": 1}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
25	inicio_hero_slide_1_cta_text	text	Catálogo de Amor	Catálogo de Amor	{"page": "inicio", "slide": 1}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
27	inicio_hero_slide_2_image	image_url	https://res.cloudinary.com/daylne1ml/image/upload/v1767689599/razoconnect/landing/lhkeffilizj2gsikjxre.jpg	https://res.cloudinary.com/daylne1ml/image/upload/v1767689599/razoconnect/landing/lhkeffilizj2gsikjxre.jpg	{"page": "inicio", "slide": 2}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
39	inicio_section_ofertas_category	category_id	\N	\N	{"page": "inicio", "label": "Ofertas Relámpago", "section": "flash_sales"}	2026-01-06 05:04:55.674988	2026-01-06 18:26:53.102695
28	inicio_hero_slide_2_eyebrow	text	Nuevos Productos	Nuevos Productos	{"page": "inicio", "slide": 2}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
29	inicio_hero_slide_2_title	text	Recién Llegados	Recién Llegados	{"page": "inicio", "slide": 2}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
30	inicio_hero_slide_2_description	text	Descubre las últimas novedades de nuestro catálogo	Descubre las últimas novedades de nuestro catálogo	{"page": "inicio", "slide": 2}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
31	inicio_hero_slide_2_cta_text	text	Ver Novedades	Ver Novedades	{"page": "inicio", "slide": 2}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
33	inicio_hero_slide_3_image	image_url	https://res.cloudinary.com/daylne1ml/image/upload/v1767689633/razoconnect/landing/fyust6egt44eq9vlcife.jpg	https://res.cloudinary.com/daylne1ml/image/upload/v1767689633/razoconnect/landing/fyust6egt44eq9vlcife.jpg	{"page": "inicio", "slide": 3}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
34	inicio_hero_slide_3_eyebrow	text	Calidad Premium	Calidad Premium	{"page": "inicio", "slide": 3}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
40	inicio_section_nuevos_category	category_id	undefined	undefined	{"page": "inicio", "label": "Nuevos Productos", "section": "new_arrivals"}	2026-01-06 05:04:55.674988	2026-01-06 18:26:54.041101
\.


--
-- TOC entry 4872 (class 0 OID 25187)
-- Dependencies: 269
-- Data for Name: log_eventosusuario; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.log_eventosusuario (eventoid, "timestamp", clienteid, sessionid, tipoevento, varianteid, contextojson) FROM stdin;
\.


--
-- TOC entry 4874 (class 0 OID 25194)
-- Dependencies: 271
-- Data for Name: log_inventario; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) FROM stdin;
\.


--
-- TOC entry 4876 (class 0 OID 25200)
-- Dependencies: 273
-- Data for Name: log_movimientos; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) FROM stdin;
1	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-19 17:44:44.70313
2	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-21 03:10:48.361285
3	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-21 03:22:54.963486
4	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-01-21 13:05:53.021814
5	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-21 23:06:54.936308
6	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-23 10:31:28.078154
7	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-23 17:27:27.440229
8	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-24 15:11:55.852066
9	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-24 15:48:40.613163
10	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-24 16:21:37.736107
11	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-24 17:24:07.495567
12	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-24 17:34:24.897833
13	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 01:19:09.330466
14	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 01:31:32.982585
15	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 01:45:49.212772
16	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 04:41:59.557446
17	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 04:54:23.300349
18	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 05:31:34.851744
19	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 05:32:03.625798
20	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 05:32:52.624282
21	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 05:58:21.962888
22	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 06:04:33.937125
23	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 06:13:09.118312
24	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 06:30:20.099103
25	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 11:25:30.571097
26	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 11:40:36.396928
27	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 12:02:33.026517
28	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 12:09:17.08571
29	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 12:10:27.458313
30	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 12:11:38.034496
31	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 12:19:14.529547
32	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 12:34:52.584294
33	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 13:41:19.817334
34	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 14:41:13.940063
35	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 14:56:26.889649
36	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 15:01:23.606116
37	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 15:06:31.050398
38	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 15:35:20.936186
39	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 15:43:10.210438
40	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 18:36:24.250325
41	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 18:49:22.633459
42	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 19:47:50.808564
43	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-25 23:55:49.263405
47	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 11:24:59.972304
48	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 13:24:53.74109
49	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 14:06:13.224752
50	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 14:08:03.029251
51	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 14:18:45.408608
52	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 14:31:21.1354
53	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 14:54:44.291244
54	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 15:14:27.769036
55	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 15:22:31.023682
56	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 15:50:50.04375
57	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 15:57:36.203924
58	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 16:05:34.397158
59	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 16:26:14.976359
60	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 16:52:11.296839
61	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 16:57:57.476266
62	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 17:13:40.787361
63	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-26 17:22:34.902303
66	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-29 01:11:08.725746
67	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-29 01:25:08.412077
68	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-29 01:33:04.711796
69	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-29 01:50:00.316987
70	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-29 01:51:26.679781
71	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-29 02:00:50.047702
72	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-29 02:01:47.055847
73	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-29 02:23:15.196811
74	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-29 02:25:17.465547
75	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-29 02:33:39.884112
76	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-29 02:34:52.849064
77	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.130.6	2025-12-30 10:15:15.787099
78	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.130.6	2025-12-30 10:15:27.792344
79	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.130.6	2025-12-30 10:18:18.673608
80	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.130.6	2025-12-30 10:18:25.803414
81	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.130.6	2025-12-30 10:18:57.992311
82	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.130.3	2025-12-30 10:36:20.661018
83	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.3	2025-12-30 23:59:47.520289
84	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.3	2025-12-31 00:04:53.276591
85	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.3	2025-12-31 00:07:09.422888
86	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2025-12-31 06:49:38.252623
87	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-31 07:16:39.372519
88	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-31 07:45:14.452949
89	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-31 07:57:37.896324
90	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-31 08:06:45.012658
91	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-31 08:07:54.748972
92	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.5	2025-12-31 08:15:51.915203
93	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-31 08:16:37.349904
94	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.3	2025-12-31 08:49:42.289999
95	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.3	2025-12-31 08:53:03.312742
96	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.5	2025-12-31 09:14:08.184367
97	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-31 09:17:59.699275
98	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-31 10:50:50.504272
99	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2025-12-31 11:35:41.63637
100	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2025-12-31 12:07:59.314469
101	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2025-12-31 12:08:57.155299
102	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2025-12-31 12:09:29.438594
103	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-02 01:33:23.777498
104	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-02 01:37:41.471755
105	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-02 02:06:37.437288
106	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-02 02:24:30.066533
107	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-02 06:00:30.81941
108	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-02 06:03:05.547716
109	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-02 06:05:51.064352
110	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-02 06:13:27.927174
111	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-02 06:30:49.732409
112	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-02 18:17:34.925964
113	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-02 18:49:16.021582
114	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.130.5	2026-01-02 20:42:44.942634
115	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.130.5	2026-01-02 20:44:14.900334
116	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.130.5	2026-01-02 20:44:26.367211
117	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.130.5	2026-01-02 21:05:16.767486
118	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.130.5	2026-01-02 23:00:28.243395
119	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-02 23:11:55.536451
120	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.130.5	2026-01-02 23:14:07.689368
121	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-02 23:16:38.200547
122	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.130.5	2026-01-02 23:27:54.831225
123	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-02 23:39:21.1955
124	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.130.3	2026-01-02 23:43:34.464193
125	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.130.6	2026-01-02 23:56:46.570426
126	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.130.6	2026-01-02 23:57:51.843073
127	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.130.3	2026-01-03 00:52:13.571217
128	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.130.3	2026-01-03 00:57:23.962134
129	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.130.3	2026-01-03 01:18:37.009541
130	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.3	2026-01-03 17:09:38.423387
131	7	Maricela García	admin	LOGIN	Admin	7	{"email": "maricelag.e@hotmail.com", "origen": "admin"}	169.254.129.3	2026-01-03 17:49:04.790471
132	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.3	2026-01-03 17:53:13.015185
133	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.3	2026-01-03 18:24:45.622807
134	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.3	2026-01-03 19:07:15.110765
135	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.3	2026-01-03 20:16:02.275472
136	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.3	2026-01-03 21:01:08.276248
137	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.3	2026-01-03 21:15:41.340838
138	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.3	2026-01-03 21:15:57.685529
139	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.3	2026-01-03 21:34:58.791239
140	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.3	2026-01-03 21:45:55.127404
141	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.3	2026-01-03 21:56:14.915422
142	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.6	2026-01-03 22:32:43.122506
143	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.6	2026-01-03 22:54:40.291487
144	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.6	2026-01-03 23:04:37.280192
145	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.5	2026-01-03 23:26:48.695728
146	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-03 23:27:26.509021
147	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-03 23:37:35.610724
148	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-03 23:41:13.670672
149	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.2	2026-01-03 23:42:28.623526
150	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-03 23:46:53.508547
151	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.5	2026-01-03 23:56:57.651601
152	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-04 00:07:17.525147
153	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.2	2026-01-04 00:09:57.477812
154	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-04 00:22:35.602788
155	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-04 00:23:47.057529
156	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.2	2026-01-04 00:24:07.712749
157	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.2	2026-01-04 00:32:10.724765
158	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.5	2026-01-04 00:40:41.255273
159	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.5	2026-01-04 00:59:42.804241
160	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.5	2026-01-04 01:19:02.978176
161	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.5	2026-01-04 02:02:09.655272
162	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.2	2026-01-04 02:53:52.536086
163	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-04 03:08:30.189299
164	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.2	2026-01-04 03:16:18.358815
165	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-04 03:16:58.082125
166	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.2	2026-01-04 03:22:42.079201
167	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.6	2026-01-04 03:42:13.997793
168	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.6	2026-01-04 03:42:45.057238
169	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.6	2026-01-04 03:44:35.711429
170	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.6	2026-01-04 04:08:37.898904
171	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.6	2026-01-04 04:45:09.912175
172	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.6	2026-01-04 05:17:32.905415
173	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-04 12:52:51.150169
174	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-04 13:12:55.114911
175	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-04 17:10:28.947185
176	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-04 18:15:04.041932
177	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-04 19:20:10.51848
178	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-04 19:46:13.681803
179	7	Maricela García	admin	LOGIN	Admin	7	{"email": "maricelag.e@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-04 21:45:04.170869
180	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-04 22:05:53.875895
181	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-04 22:35:36.863622
182	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-04 23:53:07.231378
183	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-05 00:20:04.193312
184	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-05 04:18:04.456237
185	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-05 04:27:30.615296
186	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-05 04:35:20.257872
187	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-05 05:01:04.579021
188	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-05 05:36:40.670884
190	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.5	2026-01-05 05:59:55.963763
191	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.5	2026-01-05 06:11:03.340009
192	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.5	2026-01-05 06:42:25.457031
193	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-05 13:07:59.099546
194	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-05 16:11:18.646715
195	7	Maricela García	admin	LOGIN	Admin	7	{"email": "maricelag.e@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-05 19:17:51.727503
196	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-05 20:00:43.043558
197	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.2	2026-01-05 20:23:28.779182
198	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.2	2026-01-05 21:38:04.970952
199	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-05 21:56:57.355835
200	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-05 21:58:08.515256
201	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-05 22:01:26.770471
202	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-05 22:08:30.897174
203	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-05 22:11:50.989431
204	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-05 22:14:26.0187
205	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.2	2026-01-05 22:21:09.313331
206	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-05 22:25:59.469563
207	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-05 22:28:12.344847
208	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-05 22:33:09.453184
209	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-05 22:39:48.671225
210	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.2	2026-01-05 22:42:45.520675
211	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-05 22:56:17.279654
212	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.6	2026-01-06 00:03:13.780815
213	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.2	2026-01-06 04:23:52.151953
214	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-06 04:33:45.073438
215	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-06 04:38:50.737585
216	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.2	2026-01-06 05:22:33.541667
217	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-06 05:49:30.591392
218	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.2	2026-01-06 05:51:55.868246
219	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-06 06:07:41.345243
220	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-06 06:51:00.832937
221	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-06 06:56:46.090453
222	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-06 07:02:09.800915
223	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.2	2026-01-06 07:07:25.055559
224	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-06 07:45:01.01974
225	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.6	2026-01-06 08:48:00.690071
226	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.3	2026-01-06 08:56:51.269565
227	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-06 08:58:42.033839
228	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-06 13:10:54.45353
229	7	Maricela García	admin	LOGIN	Admin	7	{"email": "maricelag.e@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-06 18:13:31.094389
230	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-06 18:26:13.144975
231	7	Maricela García	admin	LOGIN	Admin	7	{"email": "maricelag.e@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-06 18:55:53.209703
232	7	Maricela García	admin	LOGIN	Admin	7	{"email": "maricelag.e@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-06 19:01:23.441972
233	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-06 23:03:51.647137
234	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-06 23:04:55.217653
235	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-07 00:46:20.115667
236	4	Alejandra Calderón	admin	LOGIN	Admin	4	{"email": "alecaja.19@gmail.com", "origen": "admin"}	169.254.129.3	2026-01-07 16:43:40.483962
237	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.3	2026-01-07 19:16:36.38669
238	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.5	2026-01-07 19:28:23.536305
239	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	::1	2026-01-07 19:32:14.763557
240	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.2	2026-01-07 22:41:43.061784
241	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-07 23:24:25.980021
242	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.2	2026-01-07 23:47:45.185654
243	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	169.254.129.6	2026-01-08 00:24:40.005743
244	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	169.254.129.3	2026-01-08 00:38:04.268056
245	5	Lupita García	admin	LOGIN	Admin	5	{"email": "pupis_gr@icloud.com", "origen": "admin"}	189.128.58.98:49387	2026-01-08 02:00:40.665296
246	2	Fernando Garcia	admin	LOGIN	Admin	2	{"email": "fegarcia@hotmail.com", "origen": "admin"}	189.128.58.98:5279	2026-01-08 02:04:07.486476
\.


--
-- TOC entry 4878 (class 0 OID 25208)
-- Dependencies: 275
-- Data for Name: medidas; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.medidas (medidaid, tipoproductoid, nombremedida, descripcion, alto, ancho, profundidad, unidadmedida, activo, orden, fechacreacion) FROM stdin;
\.


--
-- TOC entry 4867 (class 0 OID 25162)
-- Dependencies: 263
-- Data for Name: notificaciones; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) FROM stdin;
1	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Lupita García creó productos #59.	f	2026-01-05 04:48:32.979969	{"entidad": "productos", "cambio_id": 140, "entidad_id": 59, "tipo_cambio": "INSERT"}	/admin-bitacora.html	alta	2	\N
2	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Lupita García creó productos #60.	f	2026-01-05 05:05:37.371742	{"entidad": "productos", "cambio_id": 141, "entidad_id": 60, "tipo_cambio": "INSERT"}	/admin-bitacora.html	alta	2	\N
3	1	sistema	¡Bienvenido a RazoConnect!	Gracias por unirte. Tu cuenta ha sido creada exitosamente.	f	2026-01-05 05:23:11.412087	{}	\N	normal	\N	\N
4	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Lupita García creó productos #61.	f	2026-01-05 05:28:54.678866	{"entidad": "productos", "cambio_id": 142, "entidad_id": 61, "tipo_cambio": "INSERT"}	/admin-bitacora.html	alta	2	\N
5	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Fernando actualizó productos #14.	f	2026-01-05 05:38:48.422089	{"entidad": "productos", "cambio_id": 143, "entidad_id": 14, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
6	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Maricela García actualizó productos #46.	f	2026-01-05 19:20:47.361353	{"entidad": "productos", "cambio_id": 144, "entidad_id": 46, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
7	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Maricela García actualizó productos #45.	f	2026-01-05 19:22:06.218044	{"entidad": "productos", "cambio_id": 145, "entidad_id": 45, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
8	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Maricela García actualizó productos #46.	f	2026-01-05 19:22:29.238063	{"entidad": "productos", "cambio_id": 146, "entidad_id": 46, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
9	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Maricela García actualizó productos #44.	f	2026-01-05 19:24:13.932724	{"entidad": "productos", "cambio_id": 147, "entidad_id": 44, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
10	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Maricela García actualizó productos #51.	f	2026-01-05 19:25:16.86342	{"entidad": "productos", "cambio_id": 148, "entidad_id": 51, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
11	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón creó productos #62.	f	2026-01-05 21:44:09.268446	{"entidad": "productos", "cambio_id": 149, "entidad_id": 62, "tipo_cambio": "INSERT"}	/admin-bitacora.html	alta	2	\N
12	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón creó productos #63.	f	2026-01-05 22:42:21.27107	{"entidad": "productos", "cambio_id": 150, "entidad_id": 63, "tipo_cambio": "INSERT"}	/admin-bitacora.html	alta	2	\N
13	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #34.	f	2026-01-05 22:57:42.412917	{"entidad": "productos", "cambio_id": 151, "entidad_id": 34, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
14	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón creó productos #64.	f	2026-01-05 23:15:31.270822	{"entidad": "productos", "cambio_id": 152, "entidad_id": 64, "tipo_cambio": "INSERT"}	/admin-bitacora.html	alta	2	\N
15	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #64.	f	2026-01-06 04:25:11.85625	{"entidad": "productos", "cambio_id": 153, "entidad_id": 64, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
16	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón creó productos #65.	f	2026-01-06 04:37:09.924949	{"entidad": "productos", "cambio_id": 154, "entidad_id": 65, "tipo_cambio": "INSERT"}	/admin-bitacora.html	alta	2	\N
17	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón creó productos #66.	f	2026-01-06 04:39:00.001088	{"entidad": "productos", "cambio_id": 155, "entidad_id": 66, "tipo_cambio": "INSERT"}	/admin-bitacora.html	alta	2	\N
18	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón creó productos #67.	f	2026-01-06 04:42:48.369526	{"entidad": "productos", "cambio_id": 156, "entidad_id": 67, "tipo_cambio": "INSERT"}	/admin-bitacora.html	alta	2	\N
20	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #3.	f	2026-01-06 05:43:09.812322	{"entidad": "productos", "cambio_id": 158, "entidad_id": 3, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
21	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #3.	f	2026-01-06 05:46:41.796901	{"entidad": "productos", "cambio_id": 159, "entidad_id": 3, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
22	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #3.	f	2026-01-06 05:47:46.016329	{"entidad": "productos", "cambio_id": 160, "entidad_id": 3, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
23	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #3.	f	2026-01-06 05:48:39.025756	{"entidad": "productos", "cambio_id": 161, "entidad_id": 3, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
24	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Fernando actualizó productos #3.	f	2026-01-06 05:49:50.600111	{"entidad": "productos", "cambio_id": 162, "entidad_id": 3, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
25	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Fernando actualizó productos #3.	f	2026-01-06 05:50:09.754296	{"entidad": "productos", "cambio_id": 163, "entidad_id": 3, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
26	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Fernando actualizó productos #3.	f	2026-01-06 05:51:16.977548	{"entidad": "productos", "cambio_id": 164, "entidad_id": 3, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
27	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #3.	f	2026-01-06 05:53:20.961144	{"entidad": "productos", "cambio_id": 165, "entidad_id": 3, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
28	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #67.	f	2026-01-06 06:13:31.367814	{"entidad": "productos", "cambio_id": 166, "entidad_id": 67, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
29	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #67.	f	2026-01-06 06:17:45.494585	{"entidad": "productos", "cambio_id": 167, "entidad_id": 67, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
30	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #39.	f	2026-01-06 06:40:00.5498	{"entidad": "productos", "cambio_id": 168, "entidad_id": 39, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
31	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #43.	f	2026-01-06 06:47:28.194626	{"entidad": "productos", "cambio_id": 169, "entidad_id": 43, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
32	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Lupita García actualizó productos #46.	f	2026-01-06 07:01:02.544412	{"entidad": "productos", "cambio_id": 170, "entidad_id": 46, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
33	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Lupita García actualizó productos #46.	f	2026-01-06 07:07:01.715177	{"entidad": "productos", "cambio_id": 171, "entidad_id": 46, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
34	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #46.	f	2026-01-06 07:08:39.073116	{"entidad": "productos", "cambio_id": 172, "entidad_id": 46, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
35	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #46.	f	2026-01-06 07:09:42.467712	{"entidad": "productos", "cambio_id": 173, "entidad_id": 46, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
36	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #44.	f	2026-01-06 07:14:36.649145	{"entidad": "productos", "cambio_id": 174, "entidad_id": 44, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
37	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #44.	f	2026-01-06 07:15:58.348087	{"entidad": "productos", "cambio_id": 175, "entidad_id": 44, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
38	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #48.	f	2026-01-06 07:21:27.237275	{"entidad": "productos", "cambio_id": 176, "entidad_id": 48, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
39	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #49.	f	2026-01-06 07:23:42.484233	{"entidad": "productos", "cambio_id": 177, "entidad_id": 49, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
40	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #49.	f	2026-01-06 07:24:15.22041	{"entidad": "productos", "cambio_id": 178, "entidad_id": 49, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
41	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #51.	f	2026-01-06 07:29:32.957129	{"entidad": "productos", "cambio_id": 179, "entidad_id": 51, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
42	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Alejandra Calderón actualizó productos #51.	f	2026-01-06 07:29:55.853811	{"entidad": "productos", "cambio_id": 180, "entidad_id": 51, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
43	3	sistema	¡Bienvenido a RazoConnect!	Gracias por unirte. Tu cuenta ha sido creada exitosamente.	f	2026-01-06 18:10:42.391736	{}	\N	normal	\N	\N
44	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Maricela García actualizó productos #13.	f	2026-01-06 18:20:13.203673	{"entidad": "productos", "cambio_id": 181, "entidad_id": 13, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
45	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Maricela García actualizó productos #48.	f	2026-01-06 18:25:45.41681	{"entidad": "productos", "cambio_id": 182, "entidad_id": 48, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
46	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Maricela García actualizó productos #46.	f	2026-01-06 18:27:37.866543	{"entidad": "productos", "cambio_id": 183, "entidad_id": 46, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
47	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Maricela García actualizó productos #13.	f	2026-01-06 18:28:58.878326	{"entidad": "productos", "cambio_id": 184, "entidad_id": 13, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
48	4	sistema	¡Bienvenido a RazoConnect!	Gracias por unirte. Tu cuenta ha sido creada exitosamente.	f	2026-01-06 23:51:33.77011	{}	\N	normal	\N	\N
49	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Lupita García actualizó productos #11.	f	2026-01-07 00:52:36.994918	{"entidad": "productos", "cambio_id": 185, "entidad_id": 11, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
50	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Fernando actualizó productos #50.	f	2026-01-08 01:10:47.507503	{"entidad": "productos", "cambio_id": 186, "entidad_id": 50, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
51	\N	producto	Auditoría Pasiva - Cambio aplicado	El usuario Fernando actualizó productos #50.	f	2026-01-08 01:11:06.592756	{"entidad": "productos", "cambio_id": 187, "entidad_id": 50, "tipo_cambio": "UPDATE"}	/admin-bitacora.html	alta	2	\N
\.


--
-- TOC entry 4881 (class 0 OID 25217)
-- Dependencies: 278
-- Data for Name: ordenesdecompra; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.ordenesdecompra (ordencompraid, proveedorid, fechacreacion, fechaentregaesperada, estatus, origenoc, fechasolicitud, total, usuario_creador_id, exportado_en, reporte_id) FROM stdin;
1	1	2026-01-06 07:42:44.79385	2026-01-06	Pendiente	manual	2026-01-06 07:42:44.79385	7125.27	4	\N	\N
\.


--
-- TOC entry 4883 (class 0 OID 25227)
-- Dependencies: 280
-- Data for Name: pagos_clientes; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.pagos_clientes (pago_id, cliente_id, credito_id, monto, tipo_pago, estatus, comprobante_url, referencia_bancaria, transaccion_id, fecha_pago, fecha_validacion, validado_por, notas, movimientos_aplicados) FROM stdin;
\.


--
-- TOC entry 4885 (class 0 OID 25239)
-- Dependencies: 282
-- Data for Name: pagos_cxp; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.pagos_cxp (pago_id, cxp_id, fecha_pago, monto, metodo_pago, referencia_bancaria, comprobante_url, nota, usuario_id) FROM stdin;
\.


--
-- TOC entry 4887 (class 0 OID 25247)
-- Dependencies: 284
-- Data for Name: passwordresettokens; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.passwordresettokens (tokenid, token, clienteid, agenteid, expiraen) FROM stdin;
1	9b6a0f868284ac32906eb0257ea57950a6c7567757fd101cace17f76af542495	1	\N	2026-01-07 18:22:15.256
\.


--
-- TOC entry 4889 (class 0 OID 25252)
-- Dependencies: 286
-- Data for Name: pedidos; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.pedidos (pedidoid, clienteid, agenteid, direccionenvioid, fechapedido, montototal, estatus, costoenvio, es_credito, fecha_vencimiento, pagado, transaccion_id, comprobante_url, metodo_pago, cupon_id, monto_descuento, saldo_pendiente, url_evidencia_entrega, fecha_entrega_real) FROM stdin;
\.


--
-- TOC entry 4891 (class 0 OID 25263)
-- Dependencies: 288
-- Data for Name: producto_imagenes; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) FROM stdin;
47	/uploads/1766785521330-Captura de pantalla 2025-12-26 154429.png	\N	1	13
13	/uploads/1766664642259-Captura de pantalla 2025-12-25 060942.png	\N	1	3
6	/uploads/1766664426099-Captura de pantalla 2025-12-24 163348.png	\N	1	2
7	/uploads/1766664426106-Captura de pantalla 2025-12-24 163354.png	\N	2	2
8	/uploads/1766664426106-Captura de pantalla 2025-12-24 163400.png	\N	3	2
9	/uploads/1766664426107-Captura de pantalla 2025-12-24 163410.png	\N	4	2
53	https://res.cloudinary.com/daylne1ml/image/upload/v1767475611/razoconnect_productos/qk3okhvlcdmyga1dr2ip.jpg	\N	1	16
54	https://res.cloudinary.com/daylne1ml/image/upload/v1767475611/razoconnect_productos/on2vwb5ui2tmxws5olxr.jpg	\N	2	16
55	https://res.cloudinary.com/daylne1ml/image/upload/v1767475611/razoconnect_productos/y9ertskkkmpfjiedmnde.jpg	\N	3	16
1	/uploads/1766618057659-Captura de pantalla 2025-12-24 163339.png	\N	1	1
2	/uploads/1766618057669-Captura de pantalla 2025-12-24 163230.png	\N	2	1
19	/uploads/1766665229257-Captura de pantalla 2025-12-25 061846.png	\N	1	5
20	/uploads/1766665229272-Captura de pantalla 2025-12-25 061852.png	\N	2	5
21	/uploads/1766665229274-Captura de pantalla 2025-12-25 061857.png	\N	3	5
22	/uploads/1766665229276-Captura de pantalla 2025-12-25 061905.png	\N	4	5
58	https://res.cloudinary.com/daylne1ml/image/upload/v1767483725/razoconnect_productos/ogdaikwviuedwbn3kpft.jpg	\N	1	19
59	https://res.cloudinary.com/daylne1ml/image/upload/v1767483725/razoconnect_productos/nc4zgvxq7j6spj6q9zbh.jpg	\N	2	19
60	https://res.cloudinary.com/daylne1ml/image/upload/v1767483725/razoconnect_productos/hd95ocsmvjp6yrkgvjek.jpg	\N	3	19
61	https://res.cloudinary.com/daylne1ml/image/upload/v1767483725/razoconnect_productos/celkc8ljs9cdqyx8zpjx.jpg	\N	4	19
15	/uploads/1766664848035-Captura de pantalla 2025-12-24 163440.png	\N	1	4
10	/uploads/1766664426107-Captura de pantalla 2025-12-24 163415.png	\N	5	2
48	https://res.cloudinary.com/daylne1ml/image/upload/v1767475243/razoconnect_productos/k6hb0nln4aiuchjsbgvo.jpg	\N	1	15
49	https://res.cloudinary.com/daylne1ml/image/upload/v1767475242/razoconnect_productos/wcmcijyy29haftcjmbnv.jpg	\N	2	15
50	https://res.cloudinary.com/daylne1ml/image/upload/v1767475242/razoconnect_productos/fsmqnixcuoqnjnkx1moz.jpg	\N	3	15
51	https://res.cloudinary.com/daylne1ml/image/upload/v1767475242/razoconnect_productos/iktpiknvys2s5zwftpjj.jpg	\N	4	15
34	/uploads/1766665656386-Captura de pantalla 2025-12-25 062641.png	\N	1	8
24	/uploads/1766665395737-Captura de pantalla 2025-12-25 062226.png	\N	1	6
25	/uploads/1766665395742-Captura de pantalla 2025-12-25 062231.png	\N	2	6
56	https://res.cloudinary.com/daylne1ml/image/upload/v1767475611/razoconnect_productos/q8ysh6e9mnntrun0xfnp.jpg	\N	4	16
57	https://res.cloudinary.com/daylne1ml/image/upload/v1767475611/razoconnect_productos/xojme8kllg0jqo43r1kv.jpg	\N	5	16
29	/uploads/1766665543356-Captura de pantalla 2025-12-25 062438.png	\N	1	7
30	/uploads/1766665543360-Captura de pantalla 2025-12-25 062445.png	\N	2	7
3	/uploads/1766618057672-Captura de pantalla 2025-12-24 163242.png	\N	3	1
4	/uploads/1766618057674-Captura de pantalla 2025-12-24 163309.png	\N	4	1
5	/uploads/1766618057676-Captura de pantalla 2025-12-24 163317.png	\N	5	1
63	https://res.cloudinary.com/daylne1ml/image/upload/v1767484007/razoconnect_productos/t6wrdhp3p9g8qdood1q9.jpg	\N	1	20
64	https://res.cloudinary.com/daylne1ml/image/upload/v1767484007/razoconnect_productos/lvgjlmkbmzqoc8t2f5a8.jpg	\N	2	20
65	https://res.cloudinary.com/daylne1ml/image/upload/v1767484007/razoconnect_productos/k4fkesryz1ux8jxpjih1.jpg	\N	3	20
44	/uploads/1766783087272-Captura de pantalla 2025-12-26 133425.png	\N	1	10
45	/uploads/1766783087299-Captura de pantalla 2025-12-26 133433.png	\N	2	10
26	/uploads/1766665395745-Captura de pantalla 2025-12-25 062235.png	\N	3	6
27	/uploads/1766665395746-Captura de pantalla 2025-12-25 062241.png	\N	4	6
28	/uploads/1766665395748-Captura de pantalla 2025-12-25 062246.png	\N	5	6
39	/uploads/1766778746726-Captura de pantalla 2025-12-26 133323.png	\N	1	9
35	/uploads/1766665656389-Captura de pantalla 2025-12-25 062709.png	\N	2	8
36	/uploads/1766665656390-Captura de pantalla 2025-12-25 062714.png	\N	3	8
37	/uploads/1766665656391-Captura de pantalla 2025-12-25 062719.png	\N	4	8
38	/uploads/1766665656392-Captura de pantalla 2025-12-25 062723.png	\N	5	8
16	/uploads/1766664848038-Captura de pantalla 2025-12-24 163451.png	\N	2	4
17	/uploads/1766664848039-Captura de pantalla 2025-12-24 163527.png	\N	3	4
18	/uploads/1766664848040-Captura de pantalla 2025-12-24 163532.png	\N	4	4
23	/uploads/1766665229277-Captura de pantalla 2025-12-25 061909.png	\N	5	5
11	/uploads/1766664426108-Captura de pantalla 2025-12-24 163420.png	\N	6	2
12	/uploads/1766664426108-Captura de pantalla 2025-12-24 163430.png	\N	7	2
31	/uploads/1766665543362-Captura de pantalla 2025-12-25 062451.png	\N	3	7
32	/uploads/1766665543363-Captura de pantalla 2025-12-25 062455.png	\N	4	7
33	/uploads/1766665543366-Captura de pantalla 2025-12-25 062501.png	\N	5	7
46	/uploads/1766783087314-Captura de pantalla 2025-12-26 133436.png	\N	3	10
75	https://res.cloudinary.com/daylne1ml/image/upload/v1767484547/razoconnect_productos/yccwuoo5p3pbhaguxtgs.jpg	\N	1	17
76	https://res.cloudinary.com/daylne1ml/image/upload/v1767484548/razoconnect_productos/elrrrfz4nhd4ueyxkhip.jpg	\N	2	17
77	https://res.cloudinary.com/daylne1ml/image/upload/v1767484547/razoconnect_productos/tljhmo0fopiyu2vulcov.jpg	\N	3	17
78	https://res.cloudinary.com/daylne1ml/image/upload/v1767484547/razoconnect_productos/mw5gycxnqudrgso6txef.jpg	\N	4	17
79	https://res.cloudinary.com/daylne1ml/image/upload/v1767484548/razoconnect_productos/aiaosbb6lzl1n59jt5p9.jpg	\N	5	17
80	https://res.cloudinary.com/daylne1ml/image/upload/v1767484548/razoconnect_productos/gyagxg3hqv0rckbzmjaj.jpg	\N	6	17
81	https://res.cloudinary.com/daylne1ml/image/upload/v1767484547/razoconnect_productos/kdxhbmlvxgavcxadj4qz.jpg	\N	7	17
87	https://res.cloudinary.com/daylne1ml/image/upload/v1767486522/razoconnect_productos/k6awht9kjz5s8b7jmzbr.jpg	\N	1	21
88	https://res.cloudinary.com/daylne1ml/image/upload/v1767486522/razoconnect_productos/ntajlwgko9dci8bnaslh.jpg	\N	2	21
89	https://res.cloudinary.com/daylne1ml/image/upload/v1767486522/razoconnect_productos/do8dr2hwxx2cayg6ll5s.jpg	\N	3	21
90	https://res.cloudinary.com/daylne1ml/image/upload/v1767486522/razoconnect_productos/bgv9srjkrsz201c9mlqt.jpg	\N	4	21
91	https://res.cloudinary.com/daylne1ml/image/upload/v1767486523/razoconnect_productos/uoenbdxahs4s3m0zzg2q.jpg	\N	5	21
94	https://res.cloudinary.com/daylne1ml/image/upload/v1767487198/razoconnect_productos/pcxur4xdsmwwsijnm1lv.jpg	\N	1	23
95	https://res.cloudinary.com/daylne1ml/image/upload/v1767487198/razoconnect_productos/j3soc0yp3jfxdyvgjpy7.jpg	\N	2	23
96	https://res.cloudinary.com/daylne1ml/image/upload/v1767487198/razoconnect_productos/uvrgh29p1tzgfwxmhata.jpg	\N	3	23
97	https://res.cloudinary.com/daylne1ml/image/upload/v1767487198/razoconnect_productos/we9pkbhcjo7admb5qp6c.jpg	\N	4	23
98	https://res.cloudinary.com/daylne1ml/image/upload/v1767487198/razoconnect_productos/jeb632n82ggr1grqzqjj.jpg	\N	5	23
92	https://res.cloudinary.com/daylne1ml/image/upload/v1767486907/razoconnect_productos/lh2quieimcbartklrexg.jpg	\N	1	22
93	https://res.cloudinary.com/daylne1ml/image/upload/v1767486907/razoconnect_productos/xy1vug3qxa15qvv9yujs.jpg	\N	2	22
99	https://res.cloudinary.com/daylne1ml/image/upload/v1767488012/razoconnect_productos/el5o4voa0bucibncbzlp.jpg	\N	1	24
100	https://res.cloudinary.com/daylne1ml/image/upload/v1767488012/razoconnect_productos/ckkvdmw3ilvf7tzuxcvt.jpg	\N	2	24
101	https://res.cloudinary.com/daylne1ml/image/upload/v1767488012/razoconnect_productos/pz2h10oqikx7zrdfbj30.jpg	\N	3	24
102	https://res.cloudinary.com/daylne1ml/image/upload/v1767488012/razoconnect_productos/n07lfjxtei1mmjtgluev.jpg	\N	4	24
103	https://res.cloudinary.com/daylne1ml/image/upload/v1767488012/razoconnect_productos/evxghxz3v0xdpjiqvt1y.jpg	\N	5	24
86	https://res.cloudinary.com/daylne1ml/image/upload/v1767485176/razoconnect_productos/tfeyme7hpu5lvxsfaz7d.jpg	\N	1	18
82	https://res.cloudinary.com/daylne1ml/image/upload/v1767485176/razoconnect_productos/kxhkxil71tzrlnbbqujy.jpg	\N	2	18
83	https://res.cloudinary.com/daylne1ml/image/upload/v1767485176/razoconnect_productos/omsr4cyvnk7jhk8lyqjg.jpg	\N	3	18
84	https://res.cloudinary.com/daylne1ml/image/upload/v1767485176/razoconnect_productos/xisffrkjici4cg7zfiqs.jpg	\N	4	18
85	https://res.cloudinary.com/daylne1ml/image/upload/v1767485176/razoconnect_productos/xpz31j1d8aesenejndcn.jpg	\N	5	18
104	https://res.cloudinary.com/daylne1ml/image/upload/v1767489038/razoconnect_productos/p3hdlvyknyfektdadwie.jpg	\N	1	25
105	https://res.cloudinary.com/daylne1ml/image/upload/v1767489038/razoconnect_productos/nt7ovotsotnczhykqfox.jpg	\N	2	25
106	https://res.cloudinary.com/daylne1ml/image/upload/v1767489039/razoconnect_productos/lsqfko2exg2zplkbwlti.jpg	\N	3	25
107	https://res.cloudinary.com/daylne1ml/image/upload/v1767489038/razoconnect_productos/oliwfagmx7xhurddx5t6.jpg	\N	4	25
108	https://res.cloudinary.com/daylne1ml/image/upload/v1767489039/razoconnect_productos/tpbkqyaauutjwupjogso.jpg	\N	5	25
109	https://res.cloudinary.com/daylne1ml/image/upload/v1767489787/razoconnect_productos/nwbk8hgzjyuzuqywsdyp.jpg	\N	1	26
110	https://res.cloudinary.com/daylne1ml/image/upload/v1767489787/razoconnect_productos/tntgpuyoqo4c2jdhwfbt.jpg	\N	2	26
111	https://res.cloudinary.com/daylne1ml/image/upload/v1767489787/razoconnect_productos/q25aylmrsmw9rq32gpsf.jpg	\N	3	26
112	https://res.cloudinary.com/daylne1ml/image/upload/v1767489787/razoconnect_productos/zydq6w1xp6zxlzjnenqy.jpg	\N	4	26
113	https://res.cloudinary.com/daylne1ml/image/upload/v1767489787/razoconnect_productos/y0j0j8ucgkuamjgdxusn.jpg	\N	5	26
114	https://res.cloudinary.com/daylne1ml/image/upload/v1767490365/razoconnect_productos/oavuaucqub1lhsy2yoj0.jpg	\N	1	27
115	https://res.cloudinary.com/daylne1ml/image/upload/v1767490365/razoconnect_productos/a3dlaud8sbajjitzguuv.jpg	\N	2	27
116	https://res.cloudinary.com/daylne1ml/image/upload/v1767490365/razoconnect_productos/nbnuclbaedg7vcimxtsm.jpg	\N	3	27
117	https://res.cloudinary.com/daylne1ml/image/upload/v1767490365/razoconnect_productos/sxaqfbi4eibqgnebqnk5.jpg	\N	4	27
118	https://res.cloudinary.com/daylne1ml/image/upload/v1767490365/razoconnect_productos/ezbkiif4leqqvunyzmqh.jpg	\N	5	27
119	https://res.cloudinary.com/daylne1ml/image/upload/v1767491015/razoconnect_productos/meadtebi1ukybjftdqfh.jpg	\N	1	28
120	https://res.cloudinary.com/daylne1ml/image/upload/v1767491015/razoconnect_productos/cz4juzq2swqkwq6quml8.jpg	\N	2	28
121	https://res.cloudinary.com/daylne1ml/image/upload/v1767491015/razoconnect_productos/cmzwmrjhwz4juxgt8t4u.jpg	\N	3	28
122	https://res.cloudinary.com/daylne1ml/image/upload/v1767491015/razoconnect_productos/r8kuf2jyeen2sdxtzmkl.jpg	\N	4	28
123	https://res.cloudinary.com/daylne1ml/image/upload/v1767491015/razoconnect_productos/rhnkown6w1nq3vfibzyu.jpg	\N	5	28
124	https://res.cloudinary.com/daylne1ml/image/upload/v1767492202/razoconnect_productos/zh1r8paoyjllifwbakhb.jpg	\N	1	29
125	https://res.cloudinary.com/daylne1ml/image/upload/v1767492202/razoconnect_productos/nslpdsx58a4ecfzwvcjw.jpg	\N	2	29
126	https://res.cloudinary.com/daylne1ml/image/upload/v1767492202/razoconnect_productos/aufwvpvw2hr4fi08t24b.jpg	\N	3	29
127	https://res.cloudinary.com/daylne1ml/image/upload/v1767492202/razoconnect_productos/ocfztk5legs5cxrvtqc8.jpg	\N	4	29
128	https://res.cloudinary.com/daylne1ml/image/upload/v1767492202/razoconnect_productos/bomae9gtgvxacdrgzinn.jpg	\N	5	29
129	https://res.cloudinary.com/daylne1ml/image/upload/v1767492887/razoconnect_productos/o42hcdaeg6i2oh37qiyo.jpg	\N	1	30
130	https://res.cloudinary.com/daylne1ml/image/upload/v1767492887/razoconnect_productos/c3mg3fr3kgnogfia95it.jpg	\N	2	30
131	https://res.cloudinary.com/daylne1ml/image/upload/v1767492887/razoconnect_productos/gf1juhealnoep0mjsxl2.jpg	\N	3	30
132	https://res.cloudinary.com/daylne1ml/image/upload/v1767492887/razoconnect_productos/rju4e0oxkvmqxnejlhct.jpg	\N	4	30
133	https://res.cloudinary.com/daylne1ml/image/upload/v1767492887/razoconnect_productos/osm0d1neibt1hood9kyx.jpg	\N	5	30
134	https://res.cloudinary.com/daylne1ml/image/upload/v1767493535/razoconnect_productos/m4owtzd475d2tcnupmqi.jpg	\N	1	31
135	https://res.cloudinary.com/daylne1ml/image/upload/v1767494798/razoconnect_productos/nb5q2usw9roiracszcba.jpg	\N	1	32
136	https://res.cloudinary.com/daylne1ml/image/upload/v1767494798/razoconnect_productos/tpsizyhlvhkj0cpslvpy.jpg	\N	2	32
137	https://res.cloudinary.com/daylne1ml/image/upload/v1767494798/razoconnect_productos/bv2vvdsdovebkwbhgy7j.jpg	\N	3	32
138	https://res.cloudinary.com/daylne1ml/image/upload/v1767494798/razoconnect_productos/l0rgjk1ypbqoiixj3uck.jpg	\N	4	32
139	https://res.cloudinary.com/daylne1ml/image/upload/v1767494798/razoconnect_productos/ytl0rfvthirndukmkqvf.jpg	\N	5	32
140	https://res.cloudinary.com/daylne1ml/image/upload/v1767495146/razoconnect_productos/qy7i4kagqqo1jllc5ovs.jpg	\N	1	33
141	https://res.cloudinary.com/daylne1ml/image/upload/v1767495146/razoconnect_productos/pwo1yt7xqazfioekavvg.jpg	\N	2	33
142	https://res.cloudinary.com/daylne1ml/image/upload/v1767495146/razoconnect_productos/agoika33wjpohrlwxtgy.jpg	\N	3	33
143	https://res.cloudinary.com/daylne1ml/image/upload/v1767495146/razoconnect_productos/rdz3pnqmtinczs6zk0f0.jpg	\N	4	33
144	https://res.cloudinary.com/daylne1ml/image/upload/v1767495146/razoconnect_productos/bwibnguy5pgvmudzf7mq.jpg	\N	5	33
147	https://res.cloudinary.com/daylne1ml/image/upload/v1767495678/razoconnect_productos/msd4lum37xjxtb3zvjwx.jpg	\N	1	35
148	https://res.cloudinary.com/daylne1ml/image/upload/v1767495678/razoconnect_productos/xbzfomup3dnbn4k3ej4v.jpg	\N	2	35
149	https://res.cloudinary.com/daylne1ml/image/upload/v1767495678/razoconnect_productos/yekez30gpiwbibmb2gne.jpg	\N	3	35
150	https://res.cloudinary.com/daylne1ml/image/upload/v1767495678/razoconnect_productos/dwkeiy7rsnmpszgzs1nk.jpg	\N	4	35
151	https://res.cloudinary.com/daylne1ml/image/upload/v1767495678/razoconnect_productos/vv94urwlv3sfvp1vwywz.jpg	\N	5	35
152	https://res.cloudinary.com/daylne1ml/image/upload/v1767496390/razoconnect_productos/f2zo6hblkjusty51q48r.jpg	\N	1	36
153	https://res.cloudinary.com/daylne1ml/image/upload/v1767496390/razoconnect_productos/uyn4sabk47nusqbpqkmx.jpg	\N	2	36
154	https://res.cloudinary.com/daylne1ml/image/upload/v1767496390/razoconnect_productos/yloqwgewvfdm5nlkwzpx.jpg	\N	3	36
155	https://res.cloudinary.com/daylne1ml/image/upload/v1767496390/razoconnect_productos/ixskbv98cp8035n9mmdc.jpg	\N	4	36
156	https://res.cloudinary.com/daylne1ml/image/upload/v1767496390/razoconnect_productos/j0qpj3w9pwonvqcylf6w.jpg	\N	5	36
157	https://res.cloudinary.com/daylne1ml/image/upload/v1767498491/razoconnect_productos/ltgkvzqv7smnlhwtuu9r.jpg	\N	1	37
158	https://res.cloudinary.com/daylne1ml/image/upload/v1767498491/razoconnect_productos/jom67q3dxd2ogyevsqpa.jpg	\N	2	37
159	https://res.cloudinary.com/daylne1ml/image/upload/v1767498491/razoconnect_productos/kxxvkcwzdtanz2wzpijc.jpg	\N	3	37
162	https://res.cloudinary.com/daylne1ml/image/upload/v1767500289/razoconnect_productos/gfjv73lpaylhadic2f7c.jpg	\N	1	40
163	https://res.cloudinary.com/daylne1ml/image/upload/v1767500288/razoconnect_productos/vy0xkypgpk4fgthfoix0.jpg	\N	2	40
164	https://res.cloudinary.com/daylne1ml/image/upload/v1767500910/razoconnect_productos/sdquvjvjaajsuuzslbnz.jpg	\N	1	38
165	https://res.cloudinary.com/daylne1ml/image/upload/v1767500910/razoconnect_productos/kyibh0o07j3gpmpd5aat.jpg	\N	2	38
166	https://res.cloudinary.com/daylne1ml/image/upload/v1767500910/razoconnect_productos/v0a2ckwgoonawdiecpkk.jpg	\N	3	38
40	/uploads/1766778746732-Captura de pantalla 2025-12-26 133344.png	\N	2	9
41	/uploads/1766778746734-Captura de pantalla 2025-12-26 133348.png	\N	3	9
42	/uploads/1766778746738-Captura de pantalla 2025-12-26 133356.png	\N	4	9
43	/uploads/1766778746741-Captura de pantalla 2025-12-26 133404.png	\N	5	9
52	https://res.cloudinary.com/daylne1ml/image/upload/v1767475242/razoconnect_productos/e9hmyancb7lsyvqqpmse.jpg	\N	5	15
62	https://res.cloudinary.com/daylne1ml/image/upload/v1767483725/razoconnect_productos/ncifrreftouvvp3k47uh.jpg	\N	5	19
66	https://res.cloudinary.com/daylne1ml/image/upload/v1767484007/razoconnect_productos/ovtlyvtcgpdoo4xd8iv0.jpg	\N	4	20
67	https://res.cloudinary.com/daylne1ml/image/upload/v1767484007/razoconnect_productos/lwkiemavhsx9oz66fsbw.jpg	\N	5	20
167	https://res.cloudinary.com/daylne1ml/image/upload/v1767503976/razoconnect_productos/mwcnniyu2vonlj1ew5xv.jpg	\N	1	41
168	https://res.cloudinary.com/daylne1ml/image/upload/v1767503976/razoconnect_productos/f9u1hho1ufvur2frjynm.jpg	\N	2	41
160	https://res.cloudinary.com/daylne1ml/image/upload/v1767499681/razoconnect_productos/mpxw8saohvrhnyowaxtr.jpg	\N	1	39
14	/uploads/1766664642264-Captura de pantalla 2025-12-25 060954.png	\N	2	3
161	https://res.cloudinary.com/daylne1ml/image/upload/v1767499681/razoconnect_productos/olzmmflbgolfvvznfamh.jpg	\N	2	39
169	https://res.cloudinary.com/daylne1ml/image/upload/v1767503976/razoconnect_productos/kzyguzvsm2lcbyzaljpw.jpg	\N	3	41
170	https://res.cloudinary.com/daylne1ml/image/upload/v1767503976/razoconnect_productos/yeleu5oxu1gxb6qbmth4.jpg	\N	4	41
171	https://res.cloudinary.com/daylne1ml/image/upload/v1767503976/razoconnect_productos/q9dealqsxiajjfjgkn67.jpg	\N	5	41
211	https://res.cloudinary.com/daylne1ml/image/upload/v1767566060/razoconnect_productos/xafczj4c7bejdvza2gax.jpg	\N	1	53
177	https://res.cloudinary.com/daylne1ml/image/upload/v1767533087/razoconnect_productos/awwki9ovtu9m6x0n5c16.jpg	\N	1	42
182	https://res.cloudinary.com/daylne1ml/image/upload/v1767533088/razoconnect_productos/b39hxfyn5jgzumalmeww.jpg	\N	2	42
212	https://res.cloudinary.com/daylne1ml/image/upload/v1767566060/razoconnect_productos/ywxiguxbhtbnpepd67to.jpg	\N	2	53
213	https://res.cloudinary.com/daylne1ml/image/upload/v1767566059/razoconnect_productos/khgwymrwobpvadjyw7qo.jpg	\N	3	53
187	https://res.cloudinary.com/daylne1ml/image/upload/v1767555836/razoconnect_productos/rdx0gyqezhidllshenyz.jpg	\N	1	43
197	https://res.cloudinary.com/daylne1ml/image/upload/v1767564950/razoconnect_productos/irckrm7zjl9d9f88ioou.jpg	\N	1	47
198	https://res.cloudinary.com/daylne1ml/image/upload/v1767564950/razoconnect_productos/sn9duywhyjhmtpvvckxr.jpg	\N	2	47
199	https://res.cloudinary.com/daylne1ml/image/upload/v1767564950/razoconnect_productos/drzz33wrx11jdvu2l2ck.jpg	\N	3	47
200	https://res.cloudinary.com/daylne1ml/image/upload/v1767564951/razoconnect_productos/bsnuj5bfx3d7yqpfldpk.jpg	\N	4	47
201	https://res.cloudinary.com/daylne1ml/image/upload/v1767564950/razoconnect_productos/dwirirhnyukyeavnk123.jpg	\N	5	47
214	https://res.cloudinary.com/daylne1ml/image/upload/v1767566059/razoconnect_productos/obb3g4ktpd6nnegccef4.jpg	\N	4	53
215	https://res.cloudinary.com/daylne1ml/image/upload/v1767566059/razoconnect_productos/gqmraecnbhashflwdu1i.jpg	\N	5	53
216	https://res.cloudinary.com/daylne1ml/image/upload/v1767567305/razoconnect_productos/qvw7e9sj210hlte2eqwn.jpg	\N	1	54
217	https://res.cloudinary.com/daylne1ml/image/upload/v1767567305/razoconnect_productos/gxu6viy8y6sbt4uuey9i.jpg	\N	2	54
218	https://res.cloudinary.com/daylne1ml/image/upload/v1767568015/razoconnect_productos/uywx2iuzfcfhn49rwo1l.jpg	\N	1	55
219	https://res.cloudinary.com/daylne1ml/image/upload/v1767568015/razoconnect_productos/ly9vvv5dv1giyzb13xj0.jpg	\N	2	55
220	https://res.cloudinary.com/daylne1ml/image/upload/v1767568015/razoconnect_productos/elasuobcxadimachxclj.jpg	\N	3	55
221	https://res.cloudinary.com/daylne1ml/image/upload/v1767568015/razoconnect_productos/rjhkuv6d5gemukinbsum.jpg	\N	4	55
222	https://res.cloudinary.com/daylne1ml/image/upload/v1767568015/razoconnect_productos/qcgzwlof1cezxlc6askl.jpg	\N	5	55
223	https://res.cloudinary.com/daylne1ml/image/upload/v1767568380/razoconnect_productos/koqkxsaezpnmqv2bmdkk.jpg	\N	1	56
224	https://res.cloudinary.com/daylne1ml/image/upload/v1767568380/razoconnect_productos/ergbrtnmuea67rsu0lpv.jpg	\N	2	56
225	https://res.cloudinary.com/daylne1ml/image/upload/v1767568380/razoconnect_productos/phoy6rrjdnxcyo5ctk4a.jpg	\N	3	56
226	https://res.cloudinary.com/daylne1ml/image/upload/v1767568380/razoconnect_productos/pkrxwp8tgfuis7vqvsag.jpg	\N	4	56
227	https://res.cloudinary.com/daylne1ml/image/upload/v1767568380/razoconnect_productos/gkrxtmwewknxu7ezv5ss.jpg	\N	5	56
228	https://res.cloudinary.com/daylne1ml/image/upload/v1767571195/razoconnect_productos/iuu0pylys97ifnjlowxq.jpg	\N	1	57
229	https://res.cloudinary.com/daylne1ml/image/upload/v1767571195/razoconnect_productos/zktppc3hpzrwpr0xnv45.jpg	\N	2	57
230	https://res.cloudinary.com/daylne1ml/image/upload/v1767571195/razoconnect_productos/kim0bxyymizhuophq5tn.jpg	\N	3	57
231	https://res.cloudinary.com/daylne1ml/image/upload/v1767571195/razoconnect_productos/xxdqpprni9thc2ahs9q7.jpg	\N	4	57
232	https://res.cloudinary.com/daylne1ml/image/upload/v1767571195/razoconnect_productos/elqcywn7kpoq5rr4eyx4.jpg	\N	5	57
188	https://res.cloudinary.com/daylne1ml/image/upload/v1767555836/razoconnect_productos/qv45jz78fsbln5whpu8t.jpg	\N	2	43
189	https://res.cloudinary.com/daylne1ml/image/upload/v1767555836/razoconnect_productos/fkvadwpokznwcanqghka.jpg	\N	3	43
190	https://res.cloudinary.com/daylne1ml/image/upload/v1767555836/razoconnect_productos/if5ofsflvcecjpydlrxt.jpg	\N	4	43
191	https://res.cloudinary.com/daylne1ml/image/upload/v1767555836/razoconnect_productos/tpkmvvzikllluufqyqp5.jpg	\N	5	43
202	https://res.cloudinary.com/daylne1ml/image/upload/v1767565210/razoconnect_productos/z6astrzowxdpfbajvblj.png	\N	1	48
203	https://res.cloudinary.com/daylne1ml/image/upload/v1767565388/razoconnect_productos/sgiy0stlm7rhqfdz74b2.png	\N	1	49
204	https://res.cloudinary.com/daylne1ml/image/upload/v1767565443/razoconnect_productos/a28zpeaa496wzugug22a.jpg	\N	1	50
205	https://res.cloudinary.com/daylne1ml/image/upload/v1767565443/razoconnect_productos/xroxw6wzjqos6unp199a.jpg	\N	2	50
206	https://res.cloudinary.com/daylne1ml/image/upload/v1767565443/razoconnect_productos/xoqw7vdcsyfoqdu7bqlq.jpg	\N	3	50
207	https://res.cloudinary.com/daylne1ml/image/upload/v1767565443/razoconnect_productos/avg15uiobwu0fienvqi5.jpg	\N	4	50
208	https://res.cloudinary.com/daylne1ml/image/upload/v1767565443/razoconnect_productos/b1wudhrxgw2pvzva6dhu.jpg	\N	5	50
233	https://res.cloudinary.com/daylne1ml/image/upload/v1767573003/razoconnect_productos/enug7jf9pdme4puy72gv.jpg	\N	1	58
234	https://res.cloudinary.com/daylne1ml/image/upload/v1767573003/razoconnect_productos/twihiqtsjpaaxrnxhsu0.jpg	\N	2	58
235	https://res.cloudinary.com/daylne1ml/image/upload/v1767573003/razoconnect_productos/avvzfrbiieyatlbcak1j.jpg	\N	3	58
236	https://res.cloudinary.com/daylne1ml/image/upload/v1767573003/razoconnect_productos/dok5bcotepajbwjkyceq.jpg	\N	4	58
237	https://res.cloudinary.com/daylne1ml/image/upload/v1767573003/razoconnect_productos/rnwrzpkbd3arfjiaop0z.jpg	\N	5	58
238	https://res.cloudinary.com/daylne1ml/image/upload/v1767588514/razoconnect_productos/dxxeb5hup3vrebwvzq4q.jpg	\N	1	59
239	https://res.cloudinary.com/daylne1ml/image/upload/v1767588514/razoconnect_productos/sctpdkmfp920jc2ktaze.jpg	\N	2	59
240	https://res.cloudinary.com/daylne1ml/image/upload/v1767588515/razoconnect_productos/pf2y2grhyrvidr0tmvct.jpg	\N	3	59
241	https://res.cloudinary.com/daylne1ml/image/upload/v1767588514/razoconnect_productos/q4txhsnydf47ozcjprf5.jpg	\N	4	59
242	https://res.cloudinary.com/daylne1ml/image/upload/v1767589542/razoconnect_productos/niougqsq6u3ppn1wiwoy.jpg	\N	1	60
243	https://res.cloudinary.com/daylne1ml/image/upload/v1767589542/razoconnect_productos/ifoctisam3doc4xcigc6.jpg	\N	2	60
244	https://res.cloudinary.com/daylne1ml/image/upload/v1767589542/razoconnect_productos/ppynjcrtdoq0uce71w4x.jpg	\N	3	60
245	https://res.cloudinary.com/daylne1ml/image/upload/v1767589542/razoconnect_productos/ier55onjbzziusedu2ui.jpg	\N	4	60
246	https://res.cloudinary.com/daylne1ml/image/upload/v1767589542/razoconnect_productos/xghepfjsn69vtlusyoxj.jpg	\N	5	60
247	https://res.cloudinary.com/daylne1ml/image/upload/v1767590937/razoconnect_productos/f5u7fm8gecb4jwmhxfeu.jpg	\N	1	61
248	https://res.cloudinary.com/daylne1ml/image/upload/v1767590937/razoconnect_productos/yevmkqljnmdb0pjkxq4k.jpg	\N	2	61
249	https://res.cloudinary.com/daylne1ml/image/upload/v1767590937/razoconnect_productos/il5uwwbciduljldowp6t.jpg	\N	3	61
250	https://res.cloudinary.com/daylne1ml/image/upload/v1767590937/razoconnect_productos/i3aoalhywlktcfiy5us5.jpg	\N	4	61
251	https://res.cloudinary.com/daylne1ml/image/upload/v1767590937/razoconnect_productos/o8sibah5wqmg7ziz7h1p.jpg	\N	5	61
252	https://res.cloudinary.com/daylne1ml/image/upload/v1767590937/razoconnect_productos/oad4qzedlik6peymnd34.jpg	\N	6	61
253	https://res.cloudinary.com/daylne1ml/image/upload/v1767590937/razoconnect_productos/osrf2v4wyrug17l05zsd.jpg	\N	7	61
254	https://res.cloudinary.com/daylne1ml/image/upload/v1767591530/razoconnect_productos/opjdtlluuijivi8zsplq.png	\N	1	14
255	https://res.cloudinary.com/daylne1ml/image/upload/v1767591531/razoconnect_productos/cyhvmrskmwx4qidbnmpc.png	\N	2	14
275	https://res.cloudinary.com/daylne1ml/image/upload/v1767747160/razoconnect_productos/tnpum3nvk49cxhpoaslx.jpg	\N	1	11
264	https://res.cloudinary.com/daylne1ml/image/upload/v1767649451/razoconnect_productos/zubqpq5udoly29e8jzka.jpg	\N	1	62
265	https://res.cloudinary.com/daylne1ml/image/upload/v1767649451/razoconnect_productos/detxpivr0ageatxde6s7.jpg	\N	2	62
266	https://res.cloudinary.com/daylne1ml/image/upload/v1767649451/razoconnect_productos/yhjpdkf5exgzoolranay.jpg	\N	3	62
267	https://res.cloudinary.com/daylne1ml/image/upload/v1767649451/razoconnect_productos/kpfguulmlhzuyzckrmde.jpg	\N	4	62
268	https://res.cloudinary.com/daylne1ml/image/upload/v1767652943/razoconnect_productos/plnryefvbwts29snny36.jpg	\N	1	63
145	https://res.cloudinary.com/daylne1ml/image/upload/v1767495541/razoconnect_productos/xd7w3o13hrkuwvyr8hg1.jpg	\N	1	34
146	https://res.cloudinary.com/daylne1ml/image/upload/v1767495541/razoconnect_productos/kddi1gqbxt9gvppfzckv.jpg	\N	2	34
269	https://res.cloudinary.com/daylne1ml/image/upload/v1767654933/razoconnect_productos/okhjrhce2cutwpbvsyxa.jpg	\N	1	64
270	https://res.cloudinary.com/daylne1ml/image/upload/v1767674234/razoconnect_productos/duhl1avsr4mvtmjbfgfq.jpg	\N	1	65
271	https://res.cloudinary.com/daylne1ml/image/upload/v1767674234/razoconnect_productos/bea7nqdvjikq8280zuri.jpg	\N	2	65
272	https://res.cloudinary.com/daylne1ml/image/upload/v1767674234/razoconnect_productos/yzrukbdh2846pnslakz7.jpg	\N	3	65
273	https://res.cloudinary.com/daylne1ml/image/upload/v1767674342/razoconnect_productos/o2mtmsr13hafwnmlnmy3.jpg	\N	1	66
261	https://res.cloudinary.com/daylne1ml/image/upload/v1767641055/razoconnect_productos/bo5sjtspd7kbbynpxgrw.jpg	\N	1	44
274	https://res.cloudinary.com/daylne1ml/image/upload/v1767674570/razoconnect_productos/xsurh6fww38u47zqzgbe.jpg	\N	1	67
262	https://res.cloudinary.com/daylne1ml/image/upload/v1767641056/razoconnect_productos/kmwue6ey3nog7l4xhppi.jpg	\N	2	44
276	https://res.cloudinary.com/daylne1ml/image/upload/v1767747160/razoconnect_productos/bmn9fxpjvr6opiofqp2i.jpg	\N	2	11
277	https://res.cloudinary.com/daylne1ml/image/upload/v1767747160/razoconnect_productos/vrzuhjhkq1eicfgj0vxc.jpg	\N	3	11
278	https://res.cloudinary.com/daylne1ml/image/upload/v1767747160/razoconnect_productos/vm5ccvzwinao3bzukqll.jpg	\N	4	11
263	https://res.cloudinary.com/daylne1ml/image/upload/v1767641118/razoconnect_productos/nv3snnrkkgusoalqkqw0.jpg	\N	1	51
256	https://res.cloudinary.com/daylne1ml/image/upload/v1767640849/razoconnect_productos/ny5m4o9uvwvohudsztdc.jpg	\N	1	46
279	https://res.cloudinary.com/daylne1ml/image/upload/v1767747160/razoconnect_productos/lvkms2yh7v9txnoypozk.jpg	\N	5	11
280	https://res.cloudinary.com/daylne1ml/image/upload/v1767747160/razoconnect_productos/i86wgrv2frrarjpkgibf.jpg	\N	6	11
281	https://res.cloudinary.com/daylne1ml/image/upload/v1767747160/razoconnect_productos/hlq1e33cu9vtqjwgqnmu.jpg	\N	7	11
\.


--
-- TOC entry 4913 (class 0 OID 25877)
-- Dependencies: 311
-- Data for Name: producto_imagenes_color; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.producto_imagenes_color (imagencolorid, productoid, color_nombre, url_imagen_cloudinary, public_id_cloudinary, fechacreacion) FROM stdin;
\.


--
-- TOC entry 4893 (class 0 OID 25270)
-- Dependencies: 290
-- Data for Name: producto_tamanosdisponibles; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.producto_tamanosdisponibles (productoid, tamanoid) FROM stdin;
1	5
1	4
2	3
2	4
3	3
3	4
4	5
4	4
5	5
5	4
6	5
6	4
7	5
7	4
8	5
8	4
9	5
9	3
9	4
10	3
14	2
14	3
15	5
15	3
15	4
16	5
16	3
16	4
17	3
17	4
18	3
18	4
19	5
19	3
19	4
20	5
20	3
20	4
21	3
21	4
22	3
22	4
23	3
23	4
24	3
24	4
25	3
25	4
26	3
26	4
27	3
27	4
28	3
28	4
29	3
29	4
30	3
30	4
31	3
31	4
32	3
32	4
33	3
33	4
34	5
34	3
34	4
35	3
35	4
36	3
36	4
37	5
37	3
37	4
38	5
38	3
38	4
39	5
39	3
39	4
40	5
40	3
40	4
41	3
41	4
42	3
42	4
43	3
44	4
47	3
47	4
49	4
51	3
51	4
53	3
53	4
54	3
54	4
55	3
55	4
56	3
56	4
57	3
57	4
58	3
58	4
59	3
59	4
60	4
61	4
62	3
62	4
63	2
63	3
64	2
64	3
65	3
65	4
66	5
66	3
66	4
67	3
67	4
48	4
46	4
13	3
13	4
11	3
11	4
50	1
50	3
50	4
\.


--
-- TOC entry 4894 (class 0 OID 25273)
-- Dependencies: 291
-- Data for Name: producto_variante_imagenes; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.producto_variante_imagenes (imagenid, url_imagen, textoalternativo, orden, varianteid) FROM stdin;
2	/uploads/1766664700177-Captura de pantalla 2025-12-25 060954.png	\N	1	7
4	/uploads/1766780491765-Captura de pantalla 2025-12-26 133323.png	\N	1	18
5	/uploads/1766780491771-Captura de pantalla 2025-12-26 133344.png	\N	2	18
6	/uploads/1766780491774-Captura de pantalla 2025-12-26 133348.png	\N	3	18
7	/uploads/1766780491775-Captura de pantalla 2025-12-26 133356.png	\N	4	18
8	/uploads/1766780491793-Captura de pantalla 2025-12-26 133404.png	\N	5	18
9	/uploads/1766780708466-Captura de pantalla 2025-12-26 133314.png	\N	1	23
11	https://res.cloudinary.com/daylne1ml/image/upload/v1767182907/razoconnect_productos/vdzf7ow2wfo08nehdjlf.png	\N	1	46
17	https://res.cloudinary.com/daylne1ml/image/upload/v1767487174/razoconnect_productos/qxjgiedlbsytuwkj1r15.jpg	\N	1	78
18	https://res.cloudinary.com/daylne1ml/image/upload/v1767487174/razoconnect_productos/n27tslr2n647yx27c5we.jpg	\N	2	78
19	https://res.cloudinary.com/daylne1ml/image/upload/v1767487175/razoconnect_productos/xn9osvqqghspegnqpvhe.jpg	\N	3	78
20	https://res.cloudinary.com/daylne1ml/image/upload/v1767487176/razoconnect_productos/io1gj59xwhqhwrbg3rjn.jpg	\N	4	78
21	https://res.cloudinary.com/daylne1ml/image/upload/v1767487176/razoconnect_productos/nfgelqburchikgkvprh4.jpg	\N	5	78
1	/uploads/1766664669210-Captura de pantalla 2025-12-25 060942.png	\N	1	6
12	https://res.cloudinary.com/daylne1ml/image/upload/v1767487053/razoconnect_productos/ynl4n9m3hjsi2elrwpkr.jpg	\N	1	77
13	https://res.cloudinary.com/daylne1ml/image/upload/v1767487054/razoconnect_productos/ivuvk1swstrlouoykuwg.jpg	\N	2	77
14	https://res.cloudinary.com/daylne1ml/image/upload/v1767487055/razoconnect_productos/fkrsv0rzmvocki94wl4k.jpg	\N	3	77
15	https://res.cloudinary.com/daylne1ml/image/upload/v1767487056/razoconnect_productos/bhnrdvdsbdda2u51bxlw.jpg	\N	4	77
16	https://res.cloudinary.com/daylne1ml/image/upload/v1767487057/razoconnect_productos/tgzmyix9ph5twlauif4l.jpg	\N	5	77
22	https://res.cloudinary.com/daylne1ml/image/upload/v1767500637/razoconnect_productos/cmokapigivyvckyqcp3w.jpg	\N	1	129
23	https://res.cloudinary.com/daylne1ml/image/upload/v1767500638/razoconnect_productos/rueioanqdit4735rinso.jpg	\N	2	129
24	https://res.cloudinary.com/daylne1ml/image/upload/v1767500638/razoconnect_productos/dantvngqgtwagkpguoyl.jpg	\N	3	129
25	https://res.cloudinary.com/daylne1ml/image/upload/v1767500725/razoconnect_productos/ky1qslcdy6gavta4opm1.jpg	\N	1	130
26	https://res.cloudinary.com/daylne1ml/image/upload/v1767500726/razoconnect_productos/zhdyeo2zjllj9e38blqm.jpg	\N	2	130
27	https://res.cloudinary.com/daylne1ml/image/upload/v1767500726/razoconnect_productos/gifdicnn69jbcvfdefgh.jpg	\N	3	130
41	https://res.cloudinary.com/daylne1ml/image/upload/v1767564247/razoconnect_productos/jcdkweubcf4nhveqfr4i.jpg	\N	1	144
39	https://res.cloudinary.com/daylne1ml/image/upload/v1767564170/razoconnect_productos/ubt2xwmqjzsrjtg2psoe.jpg	\N	1	141
38	https://res.cloudinary.com/daylne1ml/image/upload/v1767564146/razoconnect_productos/kjbvt7j1jnhjd0p1pozb.jpg	\N	1	140
40	https://res.cloudinary.com/daylne1ml/image/upload/v1767564214/razoconnect_productos/ocsd8fz3j56ek71os1bh.jpg	\N	1	142
42	https://res.cloudinary.com/daylne1ml/image/upload/v1767564269/razoconnect_productos/waytozimectzhlba6k7q.jpg	\N	1	145
43	https://res.cloudinary.com/daylne1ml/image/upload/v1767564296/razoconnect_productos/k5luph889wvhqf7ssxo9.jpg	\N	1	146
44	https://res.cloudinary.com/daylne1ml/image/upload/v1767564332/razoconnect_productos/b5gywh8roo3xjsoz2d0p.jpg	\N	1	147
51	https://res.cloudinary.com/daylne1ml/image/upload/v1767565256/razoconnect_productos/qvfzt6prs2g4xyxd29ld.png	\N	1	155
52	https://res.cloudinary.com/daylne1ml/image/upload/v1767565289/razoconnect_productos/frt2swzbfo4vyncbuu3k.png	\N	1	156
53	https://res.cloudinary.com/daylne1ml/image/upload/v1767565415/razoconnect_productos/r4upp5auwhbdiayesocd.png	\N	1	157
54	https://res.cloudinary.com/daylne1ml/image/upload/v1767565612/razoconnect_productos/prhxb37t0mzqcgpk9oma.png	\N	1	159
55	https://res.cloudinary.com/daylne1ml/image/upload/v1767565639/razoconnect_productos/euif0qjmqhfjuuvng9ts.png	\N	1	160
28	https://res.cloudinary.com/daylne1ml/image/upload/v1767554798/razoconnect_productos/d23p1sejbdacwdommcmh.jpg	\N	1	134
29	https://res.cloudinary.com/daylne1ml/image/upload/v1767554799/razoconnect_productos/k1yswxtpxrelpvakl9el.jpg	\N	2	134
30	https://res.cloudinary.com/daylne1ml/image/upload/v1767554800/razoconnect_productos/wqnrnhs0eogxekfqxz5w.jpg	\N	3	134
31	https://res.cloudinary.com/daylne1ml/image/upload/v1767554801/razoconnect_productos/t0bsczddl6ea63yslwrc.jpg	\N	4	134
32	https://res.cloudinary.com/daylne1ml/image/upload/v1767554801/razoconnect_productos/pgchphk9wrtkq6wckboe.jpg	\N	5	134
33	https://res.cloudinary.com/daylne1ml/image/upload/v1767554819/razoconnect_productos/r97hnsbuyikoeqvlsdai.jpg	\N	1	135
34	https://res.cloudinary.com/daylne1ml/image/upload/v1767554820/razoconnect_productos/xfparecsg7l7zpa5hyrz.jpg	\N	2	135
35	https://res.cloudinary.com/daylne1ml/image/upload/v1767554821/razoconnect_productos/ubh2vwjqwimydtruj8ws.jpg	\N	3	135
36	https://res.cloudinary.com/daylne1ml/image/upload/v1767554821/razoconnect_productos/z09ouacqaetjmalx5oey.jpg	\N	4	135
37	https://res.cloudinary.com/daylne1ml/image/upload/v1767554822/razoconnect_productos/edrgaxmmhxnzmgmzdyhy.jpg	\N	5	135
59	https://res.cloudinary.com/daylne1ml/image/upload/v1767644870/razoconnect_productos/frtawfp6gpgibd0v2qas.jpg	\N	1	175
60	https://res.cloudinary.com/daylne1ml/image/upload/v1767644870/razoconnect_productos/pf43oxapykf5l1jkw0fg.jpg	\N	2	175
61	https://res.cloudinary.com/daylne1ml/image/upload/v1767644871/razoconnect_productos/uv5frsxqsvzarbikkn0z.jpg	\N	3	175
62	https://res.cloudinary.com/daylne1ml/image/upload/v1767644871/razoconnect_productos/wkbvxdrnn6xqnpkahgcx.jpg	\N	4	175
63	https://res.cloudinary.com/daylne1ml/image/upload/v1767644872/razoconnect_productos/c5n4vpabe6dqho723ayd.jpg	\N	5	175
64	https://res.cloudinary.com/daylne1ml/image/upload/v1767644979/razoconnect_productos/bfkmii1plv7i4qrtzats.jpg	\N	1	176
65	https://res.cloudinary.com/daylne1ml/image/upload/v1767644979/razoconnect_productos/cuqbr09f8ethygphwy6w.jpg	\N	2	176
66	https://res.cloudinary.com/daylne1ml/image/upload/v1767644980/razoconnect_productos/wlthletb2kcxere6zdx9.jpg	\N	3	176
67	https://res.cloudinary.com/daylne1ml/image/upload/v1767644981/razoconnect_productos/ejpe6k5sefrgojbtprcp.jpg	\N	4	176
68	https://res.cloudinary.com/daylne1ml/image/upload/v1767644981/razoconnect_productos/zn6ucqslnnvkj7whoem2.jpg	\N	5	176
70	https://res.cloudinary.com/daylne1ml/image/upload/v1767654279/razoconnect_productos/msmpdg3wjg01wgogkyyl.jpg	\N	1	182
69	https://res.cloudinary.com/daylne1ml/image/upload/v1767654228/razoconnect_productos/lkb894x6fwcpcq40nsps.jpg	\N	1	181
71	https://res.cloudinary.com/daylne1ml/image/upload/v1767654364/razoconnect_productos/rsjcbhdsyn6fpcbmwvkp.jpg	\N	1	183
72	https://res.cloudinary.com/daylne1ml/image/upload/v1767654438/razoconnect_productos/orasyknkfkwetmtzbfqt.jpg	\N	1	184
73	https://res.cloudinary.com/daylne1ml/image/upload/v1767654491/razoconnect_productos/ck4huo31mqwxoe9xdghe.jpg	\N	1	185
74	https://res.cloudinary.com/daylne1ml/image/upload/v1767654534/razoconnect_productos/nr3xy55lbh9gtsmtbqow.jpg	\N	1	186
75	https://res.cloudinary.com/daylne1ml/image/upload/v1767673684/razoconnect_productos/hh8wrpotrbjr6qzqwmnk.jpg	\N	1	187
76	https://res.cloudinary.com/daylne1ml/image/upload/v1767673770/razoconnect_productos/kxde05jpzbebigdgcewu.jpg	\N	1	189
77	https://res.cloudinary.com/daylne1ml/image/upload/v1767673866/razoconnect_productos/hffzgmk9sqfes2mcnhkr.jpg	\N	1	191
78	https://res.cloudinary.com/daylne1ml/image/upload/v1767673982/razoconnect_productos/mrysigy76xvbi6zysvh4.jpg	\N	1	193
79	https://res.cloudinary.com/daylne1ml/image/upload/v1767674051/razoconnect_productos/etaetbflozsc47nwnphc.jpg	\N	1	195
80	https://res.cloudinary.com/daylne1ml/image/upload/v1767674625/razoconnect_productos/wj5pkpcyeya0m9jltlwu.jpg	\N	1	201
81	https://res.cloudinary.com/daylne1ml/image/upload/v1767674673/razoconnect_productos/td8hn5reb9dyp4zjog0b.jpg	\N	1	202
82	https://res.cloudinary.com/daylne1ml/image/upload/v1767674716/razoconnect_productos/puvlsvt2rhnnp8ydg9zi.jpg	\N	1	203
84	https://res.cloudinary.com/daylne1ml/image/upload/v1767677520/razoconnect_productos/mayudofuu9a3e5zdnykl.jpg	\N	1	43
86	https://res.cloudinary.com/daylne1ml/image/upload/v1767678335/razoconnect_productos/v25u8mbzolktzhjthkv8.jpg	\N	1	124
87	https://res.cloudinary.com/daylne1ml/image/upload/v1767678895/razoconnect_productos/xqdh3frzpa2ksdvs4dse.jpg	\N	1	123
88	https://res.cloudinary.com/daylne1ml/image/upload/v1767678938/razoconnect_productos/sptgidkebak8bdjq3xhl.jpg	\N	1	122
89	https://res.cloudinary.com/daylne1ml/image/upload/v1767678980/razoconnect_productos/syvjolzoxopqfir9ss6d.jpg	\N	1	121
90	https://res.cloudinary.com/daylne1ml/image/upload/v1767679039/razoconnect_productos/ywc3s9lg9ij9puhaek5f.jpg	\N	1	120
91	https://res.cloudinary.com/daylne1ml/image/upload/v1767679096/razoconnect_productos/iaqglvi0ljrgsrmokq7r.jpg	\N	1	119
92	https://res.cloudinary.com/daylne1ml/image/upload/v1767679134/razoconnect_productos/y9ejvumpfjxvzggefnqm.jpg	\N	1	118
93	https://res.cloudinary.com/daylne1ml/image/upload/v1767679195/razoconnect_productos/p7ar5r3b03y8qlovhagc.jpg	\N	1	117
94	https://res.cloudinary.com/daylne1ml/image/upload/v1767679245/razoconnect_productos/gteybogkuf6d2gdem5z7.jpg	\N	1	116
95	https://res.cloudinary.com/daylne1ml/image/upload/v1767679277/razoconnect_productos/dxbtiinmsshcxmtnzimx.jpg	\N	1	115
96	https://res.cloudinary.com/daylne1ml/image/upload/v1767679318/razoconnect_productos/vsj9nszexzewhtkoo0gf.jpg	\N	1	44
97	https://res.cloudinary.com/daylne1ml/image/upload/v1767679781/razoconnect_productos/tacvfvno2scv31iyy0ql.jpg	\N	1	204
98	https://res.cloudinary.com/daylne1ml/image/upload/v1767681399/razoconnect_productos/gmkh2jfiaxamzvgaezj6.jpg	\N	1	205
99	https://res.cloudinary.com/daylne1ml/image/upload/v1767681399/razoconnect_productos/hqz5argzeogvawfabplu.jpg	\N	2	205
100	https://res.cloudinary.com/daylne1ml/image/upload/v1767681400/razoconnect_productos/jxljw9wmqopruiddu5l3.jpg	\N	3	205
101	https://res.cloudinary.com/daylne1ml/image/upload/v1767681400/razoconnect_productos/fglshni8hrlkbxyt94ek.jpg	\N	4	205
102	https://res.cloudinary.com/daylne1ml/image/upload/v1767681401/razoconnect_productos/zy2m0obllxsqhuza3ncm.jpg	\N	5	205
103	https://res.cloudinary.com/daylne1ml/image/upload/v1767681473/razoconnect_productos/s6y2qdaoxdiuaiku3bez.jpg	\N	1	206
104	https://res.cloudinary.com/daylne1ml/image/upload/v1767681474/razoconnect_productos/kny6nv1zwlpxiakupjhm.jpg	\N	2	206
105	https://res.cloudinary.com/daylne1ml/image/upload/v1767681474/razoconnect_productos/fgyffkhntyh30idjsutl.jpg	\N	3	206
106	https://res.cloudinary.com/daylne1ml/image/upload/v1767681475/razoconnect_productos/irggflgqdnluzen1z2cj.jpg	\N	4	206
107	https://res.cloudinary.com/daylne1ml/image/upload/v1767681475/razoconnect_productos/qjksahsiglufebteh3rg.jpg	\N	5	206
56	https://res.cloudinary.com/daylne1ml/image/upload/v1767565665/razoconnect_productos/hgo9cpzrcszvftlfacek.png	\N	1	161
108	https://res.cloudinary.com/daylne1ml/image/upload/v1767834468/razoconnect_productos/eb5w1nshgloskoyjp6w1.jpg	\N	1	165
109	https://res.cloudinary.com/daylne1ml/image/upload/v1767834468/razoconnect_productos/kct3gq8mnowebvio3yud.jpg	\N	2	165
110	https://res.cloudinary.com/daylne1ml/image/upload/v1767834469/razoconnect_productos/cqubmvm6eyr7bynehppj.jpg	\N	3	165
111	https://res.cloudinary.com/daylne1ml/image/upload/v1767834470/razoconnect_productos/fzoegptweteuxt0mdtus.jpg	\N	4	165
112	https://res.cloudinary.com/daylne1ml/image/upload/v1767834471/razoconnect_productos/hc7ahxihdiqz9fpjkvko.jpg	\N	5	165
113	https://res.cloudinary.com/daylne1ml/image/upload/v1767834555/razoconnect_productos/vpvimkb4v3g6cqy8hrly.jpg	\N	1	166
114	https://res.cloudinary.com/daylne1ml/image/upload/v1767834556/razoconnect_productos/ktvbeya2qf73ctuef2wt.jpg	\N	2	166
115	https://res.cloudinary.com/daylne1ml/image/upload/v1767834557/razoconnect_productos/dfmerqaouk7kt3qw2jup.jpg	\N	3	166
116	https://res.cloudinary.com/daylne1ml/image/upload/v1767834558/razoconnect_productos/rwbbfj3usj64t5tytsaa.jpg	\N	4	166
117	https://res.cloudinary.com/daylne1ml/image/upload/v1767834559/razoconnect_productos/ujum4kks47ecoqmwxs51.jpg	\N	5	166
\.


--
-- TOC entry 4896 (class 0 OID 25280)
-- Dependencies: 293
-- Data for Name: producto_variantes; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) FROM stdin;
175	AMO-025-24X22X10-MEDIAN	Mediano	27.93	0	\N	\N	34	44.90	\N	t	1	0	\N	\N
18	AMO-018-20X20	20x20	41.93	0	\N	\N	9	62.90	\N	t	1	0	Diseño	\N
5	AMO-005	25x25	34.93	0	\N	\N	2	52.90	\N	t	1	0	\N	\N
7	AMO-007	10x10	13.23	0	\N	\N	3	19.90	\N	t	1	0	Negro	\N
9	AMO-009	20x20	27.93	0	\N	\N	4	42.90	\N	t	1	0	\N	\N
10	AMO-010	10x10	13.23	0	\N	\N	5	19.90	\N	t	1	0	\N	\N
11	AMO-011	20x20	27.93	0	\N	\N	5	42.90	\N	t	1	0	\N	\N
12	AMO-012	20x20	27.93	0	\N	\N	6	42.90	\N	t	1	0	\N	\N
13	AMO-013	25x25	34.93	0	\N	\N	6	52.90	\N	t	1	0	\N	\N
28	AMO-019-17X22	17x22	69.93	0	\N	\N	10	102.90	\N	t	1	0	\N	\N
16	AMO-016	20x20	27.93	0	\N	\N	8	42.90	\N	t	1	0	\N	\N
17	AMO-017	25x25	34.93	0	\N	\N	8	52.90	\N	t	1	0	\N	\N
8	AMO-008	15x15	20.93	0	\N	\N	4	30.90	\N	t	1	0	\N	\N
41	NAT-002-GRA	Grande	20.93	0	\N	\N	13	34.90	\N	t	1	0	\N	\N
15	AMO-015	25x25	34.93	0	\N	\N	7	52.90	\N	t	1	0	\N	\N
42	NAT-002-JUM	Jumbo	32.13	0	\N	\N	13	52.90	\N	t	1	0	\N	\N
14	AMO-014	20x20	27.93	0	\N	\N	7	42.90	\N	t	1	0	\N	\N
45	LIS-002-20X20-ORO	20x20	27.93	0	\N	\N	14	42.90	\N	t	1	0	Oro	\N
46	LIS-002-20X20-PLATA	20x20	27.93	0	\N	\N	14	42.90	\N	t	1	0	Plata	\N
47	AMO-008-25X25	25x25	34.93	0	\N	\N	4	52.90	\N	t	1	0	\N	\N
48	AMO-008-30X30	30x30	41.93	0	\N	\N	4	64.90	\N	t	1	0	\N	\N
49	AMO-008-40X40	40x40	76.93	0	\N	\N	4	117.90	\N	t	1	0	\N	\N
50	AMO-016-30X30	30x30	41.93	0	\N	\N	8	64.90	\N	t	1	0	\N	\N
51	AMO-010-25X25	25x25	34.93	0	\N	\N	5	52.90	\N	t	1	0	\N	\N
52	AMO-010-30X30	30x30	41.93	0	\N	\N	5	64.90	\N	t	1	0	\N	\N
53	AMO-001-30X30	30x30	41.93	0	\N	\N	1	64.90	\N	t	1	0	\N	\N
54	AMO-001-40X40	40x40	76.93	0	\N	\N	1	117.90	\N	t	1	0	\N	\N
55	AMO-001-50X50	50x50	97.93	0	\N	\N	1	147.90	\N	t	1	0	\N	\N
56	AMO-003-30X30	30x30	41.93	0	\N	\N	2	64.90	\N	t	1	0	\N	\N
57	AMO-003-40X40	40x40	76.93	0	\N	\N	2	117.90	\N	t	1	0	\N	\N
58	AMO-014-30X30	30x30	41.93	0	\N	\N	7	64.90	\N	t	1	0	\N	\N
59	AMO-012-30X30	30x30	41.93	0	\N	\N	6	64.90	\N	t	1	0	\N	\N
60	AMO-020-20X20	20x20	27.93	0	\N	\N	15	42.90	\N	t	1	0	\N	\N
61	AMO-020-25X25	25x25	34.93	0	\N	\N	15	52.90	\N	t	1	0	\N	\N
62	AMO-020-30X30	30x30	41.93	0	\N	\N	15	64.90	\N	t	1	0	\N	\N
63	AMO-021-20X20	20x20	27.93	0	\N	\N	16	42.90	\N	t	1	0	\N	\N
64	AMO-021-30X30	30x30	41.93	0	\N	\N	16	64.90	\N	t	1	0	\N	\N
65	TOD-001-20X20	20x20	27.93	0	\N	\N	17	42.90	\N	t	1	0	\N	\N
66	TOD-001-25X25	25x25	34.93	0	\N	\N	17	52.90	\N	t	1	0	\N	\N
67	TOD-001-30X30	30x30	41.93	0	\N	\N	17	64.90	\N	t	1	0	\N	\N
68	TOD-002-20X20	20x20	27.93	0	\N	\N	18	42.90	\N	t	1	0	\N	\N
69	TOD-002-25X25	25x25	34.93	0	\N	\N	18	52.90	\N	t	1	0	\N	\N
70	AMO-022-15X15	15x15	20.93	0	\N	\N	19	30.90	\N	t	1	0	\N	\N
71	AMO-022-50X50	50x50	97.93	0	\N	\N	19	147.90	\N	t	1	0	\N	\N
72	TOD-002-30X30	30x30	41.93	0	\N	\N	18	64.90	\N	t	1	0	\N	\N
73	AMO-023-10X10	10x10	13.23	0	\N	\N	20	19.90	\N	t	1	0	\N	\N
74	TOD-003-20X20	20x20	27.93	0	\N	\N	21	42.90	\N	t	1	0	\N	\N
75	TOD-003-25X25	25x25	34.93	0	\N	\N	21	52.90	\N	t	1	0	\N	\N
76	TOD-003-30X30	30x30	41.93	0	\N	\N	21	64.90	\N	t	1	0	\N	\N
78	AMO-024-46X32-GIGANT	46x32	48.93	0	\N	\N	22	77.90	\N	t	1	0	Gigante	\N
6	AMO-006	10x10	13.23	0	\N	\N	3	19.90	\N	t	1	0	Rojo	\N
77	AMO-024-GRA-GRANDE	30x25	34.93	0	\N	\N	22	52.90	\N	t	1	0	Grande	\N
79	TOD-004-20X20	20x20	27.93	0	\N	\N	23	42.90	\N	t	1	0	\N	\N
80	TOD-004-25X25	25x25	34.93	0	\N	\N	23	52.90	\N	t	1	0	\N	\N
81	TOD-004-30X30	30x30	41.93	0	\N	\N	23	64.90	\N	t	1	0	\N	\N
40	NAT-002-MED	Mediana	13.93	0	\N	\N	13	24.90	\N	t	1	0	\N	\N
82	TOD-005-10X10	10x10	13.23	0	\N	\N	24	19.90	\N	t	1	0	\N	\N
83	TOD-005-20X20	20x20	27.93	0	\N	\N	24	42.90	\N	t	1	0	\N	\N
84	TOD-005-25X25	25x25	34.93	0	\N	\N	24	52.90	\N	t	1	0	\N	\N
85	TOD-005-30X30	30x30	41.93	0	\N	\N	24	64.90	\N	t	1	0	\N	\N
86	TOD-005-40X40	40x40	76.93	0	\N	\N	24	117.90	\N	t	1	0	\N	\N
87	TOD-006-25X25	25x25	34.93	0	\N	\N	25	52.90	\N	t	1	0	\N	\N
88	TOD-006-30X30	30x30	41.93	0	\N	\N	25	64.90	\N	t	1	0	\N	\N
89	TOD-007-20X20	20x20	27.93	0	\N	\N	26	42.90	\N	t	1	0	\N	\N
170	CER-001-JUM	Jumbo	55.93	0	\N	\N	59	87.90	\N	t	1	0	\N	\N
90	TOD-007-25X25	25x25	34.93	0	\N	\N	26	52.90	\N	t	1	0	\N	\N
91	TOD-007-30X30	30x30	41.93	0	\N	\N	26	64.90	\N	t	1	0	\N	\N
92	TOD-008-20X20	20x20	27.93	0	\N	\N	27	42.90	\N	t	1	0	\N	\N
93	TOD-008-25X25	25x25	34.93	0	\N	\N	27	52.90	\N	t	1	0	\N	\N
94	TOD-008-30X30	30x30	41.93	0	\N	\N	27	64.90	\N	t	1	0	\N	\N
95	TOD-009-15X15	15x15	20.93	0	\N	\N	28	30.90	\N	t	1	0	\N	\N
96	TOD-009-25X25	25x25	34.93	0	\N	\N	28	52.90	\N	t	1	0	\N	\N
97	TOD-009-30X30	30x30	41.93	0	\N	\N	28	64.90	\N	t	1	0	\N	\N
98	TOD-010-20X20	20x20	27.93	0	\N	\N	29	42.90	\N	t	1	0	\N	\N
181	COR-001-GRA-ROSA	Grande	41.93	0	\N	\N	63	67.90	\N	t	1	0	Rosa	\N
186	COR-001-MED-NEGRO	Mediano	27.93	0	\N	\N	63	44.90	\N	t	1	0	Negro	\N
191	CAJ-006-6ROSAS-LILA	6 Rosas	27.93	0	\N	\N	64	44.90	\N	t	1	0	Lila	\N
201	BOL-002-GRA	Grande	13.93	0	\N	\N	67	22.90	\N	t	1	0	\N	\N
206	BAU-001-30X45	30x45	69.93	0	\N	\N	39	107.90	\N	t	1	0	\N	\N
43	AMO-006-20X20-NEGRO	20x20	27.93	0	\N	\N	3	42.90	\N	t	1	0	Negro	\N
44	AMO-006-25X25-NEGRO	25x25	34.93	0	\N	\N	3	52.90	\N	t	1	0	Negro	\N
29	LIS-001-20X20	20x20	27.93	0	\N	\N	11	42.90	\N	t	1	0	\N	\N
99	TOD-010-25X25	25x25	34.93	0	\N	\N	29	52.90	\N	t	1	0	\N	\N
100	TOD-010-30X30	30x30	41.93	0	\N	\N	29	64.90	\N	t	1	0	\N	\N
101	TOD-011-50X50	50x50	97.93	0	\N	\N	30	147.90	\N	t	1	0	\N	\N
102	TOD-012-20X20	20x20	27.93	0	\N	\N	31	42.90	\N	t	1	0	\N	\N
103	TOD-012-25X25	25x25	34.93	0	\N	\N	31	52.90	\N	t	1	0	\N	\N
104	TOD-012-30X30	30x30	41.93	0	\N	\N	31	64.90	\N	t	1	0	\N	\N
105	TOD-013-30X30	30x30	41.93	0	\N	\N	32	64.90	\N	t	1	0	\N	\N
106	TOD-014-20X20	20x20	27.93	0	\N	\N	33	42.90	\N	t	1	0	\N	\N
107	TOD-014-25X25	25x25	34.93	0	\N	\N	33	52.90	\N	t	1	0	\N	\N
108	TOD-014-30X30	30x30	41.93	0	\N	\N	33	64.90	\N	t	1	0	\N	\N
109	TOD-015-20X20	20x20	27.93	0	\N	\N	35	42.90	\N	t	1	0	\N	\N
110	TOD-015-25X25	25x25	34.93	0	\N	\N	35	52.90	\N	t	1	0	\N	\N
111	TOD-015-30X30	30x30	41.93	0	\N	\N	35	64.90	\N	t	1	0	\N	\N
112	TOD-016-20X20	20x20	27.93	0	\N	\N	36	42.90	\N	t	1	0	\N	\N
113	TOD-016-25X25	25x25	34.93	0	\N	\N	36	52.90	\N	t	1	0	\N	\N
114	TOD-016-30X30	30x30	41.93	0	\N	\N	36	64.90	\N	t	1	0	\N	\N
125	TOR-001-15X30	15x30	32.13	0	\N	\N	37	48.90	\N	t	1	0	\N	\N
126	TOR-001-30X60	30x60	69.93	0	\N	\N	37	107.90	\N	t	1	0	\N	\N
127	TOR-002-20X40	20x40	48.93	0	\N	\N	38	74.90	\N	t	1	0	\N	\N
128	TOR-002-40X80	40x80	139.93	0	\N	\N	38	209.90	\N	t	1	0	\N	\N
129	MIL-001-21X15X23-MEDIAN	21x15x23	27.93	0	\N	\N	40	42.90	\N	t	1	0	Mediana	\N
130	MIL-001-23X17X32-GRANDE	23x17x32	32.13	0	\N	\N	40	48.90	\N	t	1	0	Grande	\N
131	CUB-001-20X20	20x20	27.93	0	\N	\N	41	42.90	\N	t	1	0	\N	\N
132	CUB-001-25X25	25x25	34.93	0	\N	\N	41	52.90	\N	t	1	0	\N	\N
133	CUB-001-30X30	30x30	41.93	0	\N	\N	41	64.90	\N	t	1	0	\N	\N
136	PAS-001-20X20X13	20x20x13	34.93	0	\N	\N	43	52.90	\N	t	1	0	\N	\N
137	PAS-001-25X25X14	25x25x14	39.13	0	\N	\N	43	58.90	\N	t	1	0	\N	\N
138	PAS-001-30X30X145	30x30x14.5	45.43	0	\N	\N	43	69.90	\N	t	1	0	\N	\N
139	PAS-001-40X40X15	40x40x15	69.93	0	\N	\N	43	107.90	\N	t	1	0	\N	\N
154	BAU-002-25X35	25x35	45.43	0	\N	\N	47	69.90	\N	t	1	0	\N	\N
158	BAU-003-30X45	30x45	69.93	0	\N	\N	50	107.90	\N	t	1	0	\N	\N
171	BOL-001-23X18X10-MEDIAN	23x18x10	13.93	0	\N	\N	60	22.90	\N	t	1	0	Mediana	\N
176	AMO-025-34X27X14-GRANDE	Grande	41.93	0	\N	\N	34	67.90	\N	t	1	0	\N	\N
182	COR-001-MED-LILA	Mediano	27.93	0	\N	\N	63	44.90	\N	t	1	0	Lila	\N
187	CAJ-006-6ROSAS-MAGENT	6 Rosas	27.90	0	\N	\N	64	44.90	\N	t	1	0	Magenta	\N
192	CAJ-006-12ROSAS-LILA	12 Rosas	41.93	0	\N	\N	64	67.90	\N	t	1	0	Lila	\N
202	BOL-002-JUM	Jumbo	17.43	0	\N	\N	67	27.90	\N	t	1	0	\N	\N
124	AMO-006-50X50-ROJO	50x50	97.93	0	\N	\N	3	147.90	\N	t	1	0	Rojo	\N
123	AMO-006-50X50-NEGRO	50x50	97.93	0	\N	\N	3	147.90	\N	t	1	0	Negro	\N
122	AMO-006-40X40-ROJO	40x40	76.93	0	\N	\N	3	117.90	\N	t	1	0	Rojo	\N
121	AMO-006-40X40-NEGRO	40x40	76.93	0	\N	\N	3	117.90	\N	t	1	0	Negro	\N
120	AMO-006-30X30-ROJO	30x30	41.93	0	\N	\N	3	64.90	\N	t	1	0	Rojo	\N
119	AMO-006-30X25-NEGRO	30x30	41.93	0	\N	\N	3	64.90	\N	t	1	0	Negro	\N
118	AMO-006-25X25-ROJO	25x25	34.93	0	\N	\N	3	52.90	\N	t	1	0	Rojo	\N
117	AMO-006-15X15-NEGRO	15x15	20.93	0	\N	\N	3	30.90	\N	t	1	0	Negro	\N
116	AMO-006-20X20-ROJO	20x20	27.93	0	\N	\N	3	42.90	\N	t	1	0	Rojo	\N
115	AMO-006-15X15-ROJO	15x15	20.93	0	\N	\N	3	30.90	\N	t	1	0	Rojo	\N
141	CAJ-001-15X15-NATURA	15x15	13.23	0	\N	\N	44	20.90	\N	t	1	0	Natural	\N
151	CAJ-003-25X35-NATURA	25x35	32.13	0	\N	\N	46	52.90	\N	t	1	0	\N	\N
152	CAJ-003-30X45-NATURA	30x45	41.93	0	\N	\N	46	69.90	\N	t	1	0	\N	\N
153	CAJ-003-40X60-NATURA	40x60	69.93	0	\N	\N	46	109.90	\N	t	1	0	\N	\N
140	CAJ-001-10X10-NATURA	10x10	10.43	0	\N	\N	44	16.90	\N	t	1	0	Natural	\N
142	CAJ-001-20X20-NATURA	20x20	17.43	0	\N	\N	44	28.90	\N	t	1	0	Natural	\N
143	CAJ-001-25X25-NATURA	25x25	20.93	0	\N	\N	44	33.90	\N	t	1	0	Natural	\N
144	CAJ-001-30X30-NATURA	30x30	27.93	0	\N	\N	44	46.90	\N	t	1	0	Natural	\N
145	CAJ-001-40X40-NATURA	40x40	48.93	0	\N	\N	44	79.90	\N	t	1	0	Natural	\N
146	CAJ-001-50X50-NATURA	50x50	76.93	0	\N	\N	44	119.90	\N	t	1	0	Natural	\N
147	CAJ-001-65X65-NATURA	65x65	104.93	0	\N	\N	44	159.90	\N	t	1	0	Natural	\N
155	CAJ-004-20X20X13-NATURA	20x20x13	20.93	0	\N	\N	48	34.90	\N	t	1	0	Natural	\N
156	CAJ-004-30X30X13-NATURA	30x30x13	27.93	0	\N	\N	48	46.90	\N	t	1	0	Natural	\N
157	CAJ-005-15X30-NATURA	15x30	27.93	0	\N	\N	49	43.90	\N	t	1	0	Natural	\N
159	CAJ-005-20X40-NATURA	20x40	34.93	0	\N	\N	49	56.90	\N	t	1	0	Natural	\N
160	CAJ-005-30X60-NATURA	30x60	48.93	0	\N	\N	49	79.90	\N	t	1	0	Natural	\N
161	CAJ-005-40X80-NATURA	40x80	104.93	0	\N	\N	49	159.90	\N	t	1	0	Natural	\N
207	LIS-001-10X10	10x10	13.23	0	\N	\N	11	19.90	\N	t	1	0	\N	\N
134	CAM-001-30X25-GRANDE	Grande	34.93	0	\N	\N	42	52.90	\N	t	1	0	\N	\N
135	CAM-001-46X32-GIGANT	Gigante	48.93	0	\N	\N	42	77.90	\N	t	1	0	\N	\N
23	AMO-018-15X15-LISO	15x15	34.93	0	\N	\N	9	50.90	\N	t	1	0	Liso	\N
19	AMO-018-25X25	25x25	48.93	0	\N	\N	9	72.90	\N	t	1	0	Diseño	\N
24	AMO-018-20X20-LISO	20x20	41.93	0	\N	\N	9	62.90	\N	t	1	0	Liso	\N
25	AMO-018-25X25-LISO	25x25	48.93	0	\N	\N	9	72.90	\N	t	1	0	Liso	\N
26	AMO-018-30X30-LISO	30x30	55.93	0	\N	\N	9	84.90	\N	t	1	0	Liso	\N
27	AMO-018-50X50-LISO	50x50	111.93	0	\N	\N	9	167.90	\N	t	1	0	Liso	\N
1	AMO-001	20x20	27.93	0	\N	\N	1	42.90	\N	t	1	0	\N	\N
2	AMO-002	25x25	34.93	0	\N	\N	1	52.90	\N	t	1	0	\N	\N
3	AMO-003	15x15	20.93	0	\N	\N	2	30.90	\N	t	1	0	\N	\N
172	BOL-001-26X33X13-GRANDE	26x33x13	20.93	0	\N	\N	60	32.90	\N	t	1	0	Grande	\N
177	PAS-002-20X20X13	20X20X13	27.90	0	\N	\N	62	42.90	\N	t	1	0	\N	\N
183	COR-001-GRA-LILA	Grande	41.93	0	\N	\N	63	67.90	\N	t	1	0	Lila	\N
188	CAJ-006-12ROSAS-MAGENT	12 Rosas	41.93	0	\N	\N	64	67.90	\N	t	1	0	Magenta	\N
193	CAJ-006-6ROSAS-ROJO	6 Rosas	27.93	0	\N	\N	64	44.90	\N	t	1	0	Rojo	\N
194	CAJ-006-12ROSAS-ROJO	12 Rosas	41.93	0	\N	\N	64	67.90	\N	t	1	0	Rojo	\N
195	CAJ-006-6ROSAS-NEGRO	6 Rosas	27.93	0	\N	\N	64	44.90	\N	t	1	0	Negro	\N
196	CAJ-006-12ROSAS-NEGRO	12 Rosas	41.93	0	\N	\N	64	67.90	\N	t	1	0	Negro	\N
203	BOL-002-GIG	Gigante	27.93	0	\N	\N	67	42.90	\N	t	1	0	\N	\N
30	LIS-001-25X25	25x25	34.93	0	\N	\N	11	52.90	\N	t	1	0	\N	\N
31	LIS-001-30X30	30x30	41.93	0	\N	\N	11	64.90	\N	t	1	0	\N	\N
4	AMO-004	20x20	27.93	0	\N	\N	2	42.90	\N	t	1	0	\N	\N
173	BOL-001-33X44X13-JUMBO	33x44x13	27.93	0	\N	\N	60	42.90	\N	t	1	0	Jumbo	\N
178	PAS-002-25X25X14	25X25X14	32.13	0	\N	\N	62	48.90	\N	t	1	0	\N	\N
184	COR-001-MED-ROJO	Mediano	27.93	0	\N	\N	63	44.90	\N	t	1	0	Rojo	\N
189	CAJ-006-6ROSAS-ROSA	6 Rosas	27.93	0	\N	\N	64	44.90	\N	t	1	0	Rosa	\N
197	MIL-003-GRA	Grande	32.13	0	\N	\N	65	48.90	\N	t	1	0	\N	\N
204	COR-001-GRA-NEGRO	Grande	41.93	0	\N	\N	63	67.90	\N	t	1	0	Negro	\N
164	LUN-001-30X30	30x30	48.93	0	\N	\N	53	74.90	\N	t	1	0	\N	\N
167	BOT-001-34X1050	34x10.50	41.93	0	\N	\N	55	62.90	\N	t	1	0	\N	\N
169	MIL-002-23X17X32-GRANDE	23x17x32	32.13	0	\N	\N	57	48.90	\N	t	1	0	Grande	\N
174	BOL-001-35X39X25-GIGANT	35x39x25	34.93	0	\N	\N	60	52.90	\N	t	1	0	Gigante	\N
179	PAS-002-30X30X145	30x30x14.5	38.43	0	\N	\N	62	59.90	\N	t	1	0	\N	\N
180	PAS-002-40X40X15	40x40x15	62.93	0	\N	\N	62	97.90	\N	t	1	0	\N	\N
185	COR-001-GRA-ROJO	Grande	41.93	0	\N	\N	63	67.90	\N	t	1	0	Rojo	\N
190	CAJ-006-12ROSAS-ROSA	12 Rosas	41.93	0	\N	\N	64	67.90	\N	t	1	0	Rosa	\N
198	CAJ-007-MED	Mediana	20.93	0	\N	\N	66	32.90	\N	t	1	0	\N	\N
199	CAJ-007-GRA	Grande	27.93	0	\N	\N	66	42.90	\N	t	1	0	\N	\N
200	CAJ-007-GIG	Gigante	34.93	0	\N	\N	66	52.90	\N	t	1	0	\N	\N
205	BAU-001-25X35	25x35	45.43	0	\N	\N	39	69.90	\N	t	1	0	\N	\N
165	TOR-003-20X40-GRANDE	Grande	48.93	0	\N	\N	54	74.90	\N	t	1	0	\N	\N
166	TOR-003-30X60-JUMBO	Jumbo	69.93	0	\N	\N	54	107.90	\N	t	1	0	\N	\N
168	PAL-001-30X50-GRANDE	Grande	41.93	0	\N	\N	56	64.90	\N	t	1	0	\N	\N
\.


--
-- TOC entry 4898 (class 0 OID 25293)
-- Dependencies: 295
-- Data for Name: productos; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, sku_maestro, reglaid, created_by_admin_id) FROM stdin;
59	3	Cerillo Party	Caja con un diseño original y funcional. Perfecta para entregar regalos especiales con un toque moderno y divertido. Resistente, fácil de armar, con asas, acabado barniz brillante.	t	1	CER-001	1	\N
63	1	Corazón Liso	¡Dale un toque de elegancia y ternura a tus detalles! Esta hermosa caja con forma de corazón en colores rosa, lila, rojo y negro, es la opción perfecta para empaques de San Valentín, aniversarios, cumpleaños o cualquier ocasión especial. Su acabado liso y minimalista permite que el regalo sea el verdadero protagonista.	t	1	COR-001	2	\N
65	1	Milk Lisa Colores	Dale un toque vibrante y profesional a tus regalos con nuestras cajas tipo "milk box". Ahora con un acabado mejorado en barniz, estas cajas no solo lucen increíbles, sino que ofrecen una textura premium y mayor durabilidad.	t	1	MIL-003	1	\N
11	1	Cubo Liso	\N	t	1	LIS-001	1	2
60	3	Bolsa Guapos	Bolsa Kraft de material resistente, con diseños únicos, ideal para sorprender a esa persona especial, acabado mate.	t	1	BOL-001	1	\N
14	1	Línea Metalizada	\N	t	1	LIS-002	1	2
34	2	Corazón Colors Love	¡Expresa tus sentimientos con una explosión de color! Nuestra línea Corazón Colors Love está diseñada para quienes buscan un empaque dinámico, moderno y lleno de alegría. Estas cajas no son solo un envoltorio, son parte del regalo mismo.	t	1	AMO-025	1	2
66	1	Caja Bolsa	Dale a tus regalos una presentación inolvidable con nuestra Cajabolsa, el híbrido perfecto entre una caja resistente y una bolsa práctica. Este modelo destaca por su vibrante color rojo y un acabado de alta calidad diseñado para sorprender.	t	1	CAJ-007	1	\N
3	1	Cubo Liso Brillo	Estas cajas no solo son contenedores, son parte del regalo mismo. Gracias a su acabado brillante y su vibrante color negro o rojo, son perfectas para San Valentín, aniversarios, cumpleaños o cualquier ocasión especial donde quieras impresionar.	t	1	AMO-006	2	2
36	3	Cubo Baby	Hermosas cajas, en tonos pastel, para celebrar la llegada de un ser pequeñito  y muy especial, acabado barniz brillante.	t	1	TOD-016	1	2
5	2	Cubo Love Craft	¡Haz que cada regalo sea inolvidable desde el primer vistazo! Nuestra línea de cajas Love Craft está diseñada para quienes buscan salir de lo convencional y entregar un detalle lleno de color, arte y emoción.	t	1	AMO-010	1	2
20	2	Cubo TQM	El Cubo TQM es una caja de regalo premium que combina un diseño moderno con mensajes sentimentales. Su forma cúbica y compacta la hace ideal para contener joyería, dulces finos, lociones o pequeños detalles significativos.	t	1	AMO-023	1	2
41	3	Cubo Pesca y Cacería	Cajas para caballero toda ocasión, diseños sobrios para festejar a esa persona especial, acabado barniz brillante.	t	1	CUB-001	1	2
15	2	Cubo Friends & Love	¡Haz que tu regalo destaque desde el primer momento! Nuestra colección Friends & Love combina un diseño urbano tipo graffiti con mensajes llenos de sentimiento, perfectos para cualquier ocasión especial.	t	1	AMO-020	1	2
37	2	Torre RedBlack	Sorprende a esa persona especial con nuestras Torres RedBlack, cajas de regalo premium diseñadas para cautivar. Con un estilo moderno y una combinación vibrante de colores rojo, blanco y negro, estas torres son más que un empaque: son un mensaje de amor por sí mismas.	t	1	TOR-001	1	2
1	2	Cubo Colors Love	Dale un toque de color y alegría a tus detalles con nuestro Cubo Colors Love. Diseñado especialmente para quienes no temen expresar su cariño de forma vibrante, este cubo decorativo es mucho más que una caja: es el complemento ideal que hará que tu regalo destaque desde el primer momento.	t	1	AMO-001	1	2
8	2	Cubo Hecho en México	Dale un toque auténtico y vibrante a tus detalles con nuestras cajas de regalo temáticas. Diseñadas con el icónico sello de "Hecho en México", estas cajas no solo sirven como empaque, sino como un elemento decorativo de alta calidad que resalta el orgullo nacional.	t	1	AMO-016	1	2
40	2	Milk Love	Estas cajas de regalo tipo "cartón de leche" son una opción creativa y encantadora para cualquier detalle especial. Su diseño único combina la nostalgia de un envase clásico con mensajes modernos y románticos.	t	1	MIL-001	1	2
38	2	Torre Love	Sorprende a esa persona especial con nuestra Torre Love, una caja de regalo decorativa diseñada para cautivar. Con un estilo moderno y vibrante, es el empaque ideal para arreglos florales, dulces, peluches o cualquier sorpresa inolvidable.	t	1	TOR-002	1	2
17	3	Cubo Cumple Craft	Caja craft de colores, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes con acabado mate.	t	1	TOD-001	1	2
9	2	Cubo Acetato	¡Eleva tus regalos al siguiente nivel con nuestros Cubos Corazón de Acetato! Diseñados para combinar elegancia y sentimiento, estos cubos son la base ideal para arreglos florales, desayunos sorpresa, dulces o peluches.	t	1	AMO-018	1	2
21	3	Cubo Cómics	Caja con diseño, ideal para celebraciones especiales, colores vibrantes con acabado barniz brillante.	t	1	TOD-003	1	2
23	3	Cubo Botana	Caja con diseños divertidos, ideal para esa persona tan especial, colores vibrantes acabado barniz brillante	t	1	TOD-004	1	2
22	2	Camisera Colors Love	Estas cajas de regalo tipo "Camisera" son perfectas para quienes buscan un empaque vibrante, alegre y lleno de sentimiento. Su diseño "Colors Love" destaca por una explosión de colores neón, tipografías estilo pop-art y mensajes románticos que las hacen ideales para San Valentín, aniversarios o cualquier ocasión especial.	t	1	AMO-024	1	2
24	3	Cubo Felicidades	Caja con diseños espectaculares, felicitaciones increíbles y todo en un solo empaque, colores vibrantes acabado barniz brillante.	t	1	TOD-005	1	2
18	3	Cubo Cumple Graffiti	Caja con diseño, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes acabado barniz brillante.	t	1	TOD-002	1	2
25	3	Cubo Cumple Colors	Caja de colores, empaques perfectos para tus detalles, diseñadas para convertir un regalo en una experiencia inolvidable, colores espectaculares con acabado barniz brillante.	t	1	TOD-006	1	2
26	3	Cubo Bolas y Rayas	Cubo craft, bolas y rayas de colores, ideal para cualquier ocasión, colores sobrios en acabado mate.	t	1	TOD-007	1	2
27	3	Cubo Paris-London	Cubo con diseños bonitos y tiernos, para toda ocasión, colores con un toque de dulzura, acabado barniz brillante.	t	1	TOD-008	1	2
28	3	Cubo Feliz	Cajas con diseño divertido, ideales para cumpleaños ó cualquier celebración especial, colores explosivos con acabado barniz brillante.	t	1	TOD-009	1	2
29	3	Cubo Nice	Caja con diseños de marcas aesthetic, divertidas para cualquier ocasión, con acabado barniz brillante.	t	1	TOD-010	1	2
30	3	Cubo Cumple White	Caja, que por su medida es perfecta para un regalo increíble, diseños de cumpleaños para esa persona especial, acabado barniz brillante.	t	1	TOD-011	1	2
31	3	Cubo Luxe	Cajas de colores divertidos para toda ocasión, en acabado mate.	t	1	TOD-012	1	2
32	3	Cubo Sports	Cajas con diseños y frases divertidas, con las marcas de tus tenis favoritos, colores con acabado barniz brillante.	t	1	TOD-013	1	2
33	3	Cubo Marcas	Cajas con diseños y frases divertidas, con marcas de cerveza, ideales para caballero, acabado barniz brillante.	t	1	TOD-014	1	2
35	3	Cubo Incógnita	Cajas para toda ocasión, con colores básicos, pero divertidos, acabado barniz brillante.	t	1	TOD-015	1	2
6	2	Cubo Colores Amor	¡Haz que cada detalle cuente! Nuestra colección Colores Amor está diseñada para quienes buscan transformar un simple regalo en una experiencia inolvidable. Estas cajas no son solo empaques, son una declaración de afecto con un diseño vibrante y moderno.	t	1	AMO-012	1	2
19	2	Cubo Love	¡Haz que cada momento especial sea inolvidable! Nuestro Cubo LOVE no es solo una caja, es una experiencia diseñada para expresar tus sentimientos de la forma más creativa y elegante.	t	1	AMO-022	1	2
4	2	Cubo Love Black	El Cubo Love Black es la opción perfecta para quienes buscan un empaque impactante, moderno y lleno de sentimiento. Diseñada con un fondo negro profundo que hace resaltar colores vibrantes, esta caja no es solo un empaque, sino parte del regalo mismo.	t	1	AMO-008	1	2
2	2	Cubo LV Oro	Eleva la presentación de tus detalles con nuestra exclusiva línea de Cajas Cubo LV Oro. Diseñadas con un elegante acabado en color oro y tipografía estilizada, estas cajas son perfectas para San Valentín, aniversarios o cualquier ocasión especial donde el amor sea el protagonista.	t	1	AMO-003	1	2
16	2	Cubo Novios Guapos	¡Lleva tu regalo al siguiente nivel con nuestras cajas decorativas de la línea Novios Guapos! Diseñadas con colores neón, tipografías estilo graffiti y mensajes llenos de amor, estas cajas no son solo un empaque, son parte de la sorpresa.	t	1	AMO-021	1	2
61	3	Sobre Cumple	Sobre de dinero, ideal para cuando no sabes que regalar, diseños alegres y divertidos, con acabado barniz brillante.	t	1	SOB-001	1	\N
39	2	Baúl Colors Love	¡Dale un toque vibrante y lleno de vida a tus detalles! Nuestra línea de Baúles Colors Love está diseñada para quienes no temen expresar sus sentimientos con fuerza y color. Ideales para envolver regalos, guardar recuerdos o decorar espacios con un estilo moderno y dinámico.	t	1	BAU-001	1	2
7	2	Cubo RedBlack Love	Sorprende a esa persona especial con nuestros elegantes cubos decorativos de la colección RedBlack Love. Diseñados con una combinación clásica de rojo, negro y blanco, estos cubos son el empaque perfecto para regalos inolvidables o como un detalle decorativo lleno de sentimiento.	t	1	AMO-014	1	2
10	2	Libreta	¡Dale estilo a tus notas con estas libretas de diseño exclusivo! Perfectas para regalo o para uso personal, estas libretas combinan un diseño moderno con materiales de alta resistencia.	t	1	AMO-019	5	2
55	3	Botella Cumple	Caja para celebrar a esa persona especial, color, diseño y tamaño perfecto para una botella de vino, con acabado barniz brillante.	t	1	BOT-001	1	2
56	3	Palomita	Caja para celebrar a esa persona especial, diseño divertido y tamaño perfecto para un regalo espectacular, con acabado barniz brillante.	t	1	PAL-001	1	2
42	3	Camisera Cumple	Caja con colores fascinantes, que harán de tu regalo una experiencia única, diseños coloridos para esa celebración especial, en acabado barniz brillante.	t	1	CAM-001	1	2
57	3	Milk Cumple Colors	Caja con diseño divertido, ideal para celebrar el cumpleaños de esa persona especial, colores vibrantes acabado barniz brillante.	t	1	MIL-002	1	2
58	3	Six Pack Men	Caja con diseños divertidos, perfecta para cervezas ó bebidas, resistente, con estilo y ese look que siempre queda bien. Ideal para armar regalos cool y sorprender, acabado barniz brillante.	t	1	SIX-002	1	2
47	3	Baúl Cumple	Caja para celebrar a esa persona especial, color, diseño y tamaño perfecto para un regalo espectacular, con acabado barniz brillante	t	1	BAU-002	1	2
53	3	Lunch Party	Caja para celebrar a esa persona especial, ideal para un desayuno sorpresa ó si lo prefieres retiras el interior y colocas tu regalo, color, diseño y tamaño perfecto, con acabado barniz brillante.	t	1	LUN-001	1	2
54	3	Torre Cumple Colors	Caja para celebrar a esa persona especial, color, diseño y tamaño perfecto para un regalo espectacular, con acabado barniz brillante.	t	1	TOR-003	1	2
64	1	Caja para Rosas	Eleva la presentación de tus arreglos florales con nuestras cajas exclusivas. Diseñadas específicamente para proteger y resaltar la belleza de las rosas, estas cajas en colores magenta, rosa, lila, rojo y negro,  son la opción perfecta para San Valentín, aniversarios o cualquier ocasión especial.	t	1	CAJ-006	2	\N
49	4	Torre Natural	Caja de regalo tipo torre kraft, original y llamativa. Ideal para armar regalos en capas y crear una presentación impactante. Resistente, fácil de armar y perfecta para personalizar con un estilo natural y moderno 🎁✨	t	1	CAJ-005	1	2
13	4	Camisera Natural	Caja camisera de regalo natural, elegante y funcional. Ideal para presentar prendas y regalos con un estilo limpio y moderno. Resistente, práctica y fácil de personalizar. Disponible en diferentes tamaños para adaptarse a cada detalle 🎁✨	t	1	NAT-002	1	2
62	1	Pastelera Toda Ocasión	Dale a tus regalos el empaque que merecen con nuestra línea de cajas pasteleras. Diseñadas para combinar resistencia, estilo y practicidad, estas cajas son ideales para regalos especiales.	t	1	PAS-002	1	\N
67	1	Bolsa Boutique Colores	¡Dale un toque de color y estilo a tus entregas! Estas bolsas de color son ideales para quienes buscan resistencia y una presentación impecable. Su diseño vibrante y moderno las hace perfectas para boutiques, papelerías o eventos especiales.	t	1	BOL-002	1	\N
43	3	Pastelera De Luxe	Caja con colores intensos, ideal para cualquier ocasión, hotstampin, acabado mate.	t	1	PAS-001	1	2
51	4	Six Pack Natural	Six pack kraft natural, perfecta para cervezas o bebidas. Resistente, con estilo y ese look natural que siempre queda bien. Ideal para armar regalos cool y sorprender 🍺✨	t	1	SIX-001	1	2
44	4	Cubo Natural	Cubo kraft natural, simple, bonita y con mucho estilo. Ideal para presentar tus detalles con un look natural y moderno. Resistente, práctica y fácil de personalizar. Disponible en tamaños desde 10 x 10 x 10 cm hasta 65 x 65 x 65 cm ✨🎁	t	1	CAJ-001	1	2
50	3	Baúl Colors Cumple	Caja para celebrar a esa persona especial, color, diseño y tamaño perfecto para un regalo espectacular, con acabado barniz brillante	t	1	BAU-003	1	2
48	4	Lunch Natural	Caja tipo lunch kraft natural, práctica y con mucho estilo. Ideal para armar desayunos sorpresa y detalles especiales. Resistente, fácil de armar y perfecta para personalizar y sorprender 🎁✨	t	1	CAJ-004	1	2
46	4	Baúl Natural	Caja baúl de regalo kraft color natural, con un diseño original y funcional. Perfecta para presentar regalos especiales con un toque natural y moderno. Resistente, fácil de armar y personalizar. Disponible en varios tamaños 🎁✨	t	1	CAJ-003	1	2
\.


--
-- TOC entry 4900 (class 0 OID 25300)
-- Dependencies: 297
-- Data for Name: proveedor_reglas_empaque; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.proveedor_reglas_empaque (reglaid, proveedorid, tipoproductoid, cantidadempaque, descripcion, nombre_regla) FROM stdin;
3	3	1	12	Caja (12)	\N
4	3	1	10	Caja (10)	\N
2	1	1	6	Caja (6)	\N
1	1	1	12	Caja (12)	\N
5	1	4	6	Libretas (6)	\N
\.


--
-- TOC entry 4902 (class 0 OID 25305)
-- Dependencies: 299
-- Data for Name: proveedores; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.proveedores (proveedorid, nombreempresa, contactonombre, email, telefono, razonsocial, rfc, regimenfiscal, calle, colonia, codigopostal, ciudad, estado, nombrerepresentanteventas, celularventas, emailventas, nombrecontactocobranza, telefonocobranza, emailcobranza, banco, numerocuenta, clabe, referenciapago, diascredito, limitecredito, descuentofinanciero, minimocompra, aceptadevoluciones) FROM stdin;
1	Fashion	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f
3	ExploWorld	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f
\.


--
-- TOC entry 4904 (class 0 OID 25311)
-- Dependencies: 301
-- Data for Name: solicitudes_credito; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.solicitudes_credito (solicitud_id, cliente_id, monto_solicitado, motivo_uso, estado, fecha_solicitud, comentarios_admin) FROM stdin;
\.


--
-- TOC entry 4921 (class 0 OID 26144)
-- Dependencies: 319
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.tenants (tenant_id, nombre_cliente, dominio, is_active, created_at) FROM stdin;
1	Razo Connect	razoconnect-api-hwafd9ghd8axfeas.mexicocentral-01.azurewebsites.net	t	2026-01-07 23:40:05.099814
\.


--
-- TOC entry 4906 (class 0 OID 25319)
-- Dependencies: 303
-- Data for Name: tipoproducto; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.tipoproducto (tipoproductoid, nombre, descripcion, activo, fechacreacion) FROM stdin;
1	Caja	\N	t	2025-12-11 19:06:19.742054
2	Peluche	\N	t	2025-12-12 11:10:10.356383
3	Bolsa	\N	t	2025-12-12 18:54:55.894453
4	Cuadernos	\N	t	2025-12-12 18:57:10.106707
\.


--
-- TOC entry 4908 (class 0 OID 25327)
-- Dependencies: 305
-- Data for Name: toma_inventario_conteos; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.toma_inventario_conteos (conteoid, sesionid, varianteid, conteo_a, usuario_a_id, conteo_b, usuario_b_id, cantidad_final, estatus_fila, estatus_aplicacion) FROM stdin;
\.


--
-- TOC entry 4910 (class 0 OID 25334)
-- Dependencies: 307
-- Data for Name: toma_inventario_sesiones; Type: TABLE DATA; Schema: public; Owner: ferram
--

COPY public.toma_inventario_sesiones (sesionid, nombre, fechainicio, fechacierre, estatus, usuario_creador_id) FROM stdin;
\.


--
-- TOC entry 5097 (class 0 OID 0)
-- Dependencies: 221
-- Name: jobid_seq; Type: SEQUENCE SET; Schema: cron; Owner: azuresu
--

SELECT pg_catalog.setval('cron.jobid_seq', 1, false);


--
-- TOC entry 5098 (class 0 OID 0)
-- Dependencies: 223
-- Name: runid_seq; Type: SEQUENCE SET; Schema: cron; Owner: azuresu
--

SELECT pg_catalog.setval('cron.runid_seq', 1, false);


--
-- TOC entry 5099 (class 0 OID 0)
-- Dependencies: 226
-- Name: administradores_adminid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.administradores_adminid_seq', 7, true);


--
-- TOC entry 5100 (class 0 OID 0)
-- Dependencies: 228
-- Name: agentesdeventas_agenteid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.agentesdeventas_agenteid_seq', 2, true);


--
-- TOC entry 5101 (class 0 OID 0)
-- Dependencies: 230
-- Name: carritodecompra_carritoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.carritodecompra_carritoid_seq', 2, true);


--
-- TOC entry 5102 (class 0 OID 0)
-- Dependencies: 232
-- Name: cat_cxp_etiquetas_etiqueta_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cat_cxp_etiquetas_etiqueta_id_seq', 1, false);


--
-- TOC entry 5103 (class 0 OID 0)
-- Dependencies: 234
-- Name: cat_tamanopaquetes_tamanoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cat_tamanopaquetes_tamanoid_seq', 5, true);


--
-- TOC entry 5104 (class 0 OID 0)
-- Dependencies: 236
-- Name: categorias_categoriaid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.categorias_categoriaid_seq', 4, true);


--
-- TOC entry 5105 (class 0 OID 0)
-- Dependencies: 238
-- Name: cliente_creditos_credito_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cliente_creditos_credito_id_seq', 1, false);


--
-- TOC entry 5106 (class 0 OID 0)
-- Dependencies: 240
-- Name: cliente_direcciones_direccionid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cliente_direcciones_direccionid_seq', 1, false);


--
-- TOC entry 5107 (class 0 OID 0)
-- Dependencies: 242
-- Name: clientes_clienteid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.clientes_clienteid_seq', 4, true);


--
-- TOC entry 5108 (class 0 OID 0)
-- Dependencies: 244
-- Name: comisiones_comisionid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.comisiones_comisionid_seq', 1, false);


--
-- TOC entry 5109 (class 0 OID 0)
-- Dependencies: 246
-- Name: communicationlogs_logid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.communicationlogs_logid_seq', 1, true);


--
-- TOC entry 5110 (class 0 OID 0)
-- Dependencies: 248
-- Name: control_cambios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.control_cambios_id_seq', 189, true);


--
-- TOC entry 5111 (class 0 OID 0)
-- Dependencies: 250
-- Name: credito_movimientos_movimiento_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.credito_movimientos_movimiento_id_seq', 1, false);


--
-- TOC entry 5112 (class 0 OID 0)
-- Dependencies: 252
-- Name: cuentas_por_cobrar_cxcid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cuentas_por_cobrar_cxcid_seq', 1, false);


--
-- TOC entry 5113 (class 0 OID 0)
-- Dependencies: 254
-- Name: cuentas_por_pagar_cxp_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cuentas_por_pagar_cxp_id_seq', 1, false);


--
-- TOC entry 5114 (class 0 OID 0)
-- Dependencies: 312
-- Name: cupones_cuponid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cupones_cuponid_seq', 1, false);


--
-- TOC entry 5115 (class 0 OID 0)
-- Dependencies: 256
-- Name: cxp_etiquetas_asignadas_asignacion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cxp_etiquetas_asignadas_asignacion_id_seq', 1, false);


--
-- TOC entry 5116 (class 0 OID 0)
-- Dependencies: 258
-- Name: datos_bancarios_empresa_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.datos_bancarios_empresa_id_seq', 2, true);


--
-- TOC entry 5117 (class 0 OID 0)
-- Dependencies: 260
-- Name: detallesdelpedido_detalleid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.detallesdelpedido_detalleid_seq', 1, false);


--
-- TOC entry 5118 (class 0 OID 0)
-- Dependencies: 262
-- Name: detallesordencompra_detalleoc_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.detallesordencompra_detalleoc_id_seq', 96, true);


--
-- TOC entry 5119 (class 0 OID 0)
-- Dependencies: 320
-- Name: developers_dev_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.developers_dev_id_seq', 2, true);


--
-- TOC entry 5120 (class 0 OID 0)
-- Dependencies: 266
-- Name: estados_estadoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.estados_estadoid_seq', 32, true);


--
-- TOC entry 5121 (class 0 OID 0)
-- Dependencies: 314
-- Name: inventarios_admin_inventario_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.inventarios_admin_inventario_id_seq', 1, false);


--
-- TOC entry 5122 (class 0 OID 0)
-- Dependencies: 268
-- Name: itemsdelcarrito_itemid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.itemsdelcarrito_itemid_seq', 1, true);


--
-- TOC entry 5123 (class 0 OID 0)
-- Dependencies: 316
-- Name: landing_page_config_config_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.landing_page_config_config_id_seq', 60, true);


--
-- TOC entry 5124 (class 0 OID 0)
-- Dependencies: 270
-- Name: log_eventosusuario_eventoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.log_eventosusuario_eventoid_seq', 1, false);


--
-- TOC entry 5125 (class 0 OID 0)
-- Dependencies: 272
-- Name: log_inventario_logid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.log_inventario_logid_seq', 1, false);


--
-- TOC entry 5126 (class 0 OID 0)
-- Dependencies: 274
-- Name: log_movimientos_logid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.log_movimientos_logid_seq', 246, true);


--
-- TOC entry 5127 (class 0 OID 0)
-- Dependencies: 276
-- Name: medidas_medidaid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.medidas_medidaid_seq', 1, false);


--
-- TOC entry 5128 (class 0 OID 0)
-- Dependencies: 277
-- Name: notificaciones_notificacionid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.notificaciones_notificacionid_seq', 51, true);


--
-- TOC entry 5129 (class 0 OID 0)
-- Dependencies: 279
-- Name: ordenesdecompra_ordencompraid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.ordenesdecompra_ordencompraid_seq', 1, true);


--
-- TOC entry 5130 (class 0 OID 0)
-- Dependencies: 281
-- Name: pagos_clientes_pago_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.pagos_clientes_pago_id_seq', 1, false);


--
-- TOC entry 5131 (class 0 OID 0)
-- Dependencies: 283
-- Name: pagos_cxp_pago_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.pagos_cxp_pago_id_seq', 1, false);


--
-- TOC entry 5132 (class 0 OID 0)
-- Dependencies: 285
-- Name: passwordresettokens_tokenid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.passwordresettokens_tokenid_seq', 1, true);


--
-- TOC entry 5133 (class 0 OID 0)
-- Dependencies: 287
-- Name: pedidos_pedidoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.pedidos_pedidoid_seq', 1, false);


--
-- TOC entry 5134 (class 0 OID 0)
-- Dependencies: 310
-- Name: producto_imagenes_color_imagencolorid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.producto_imagenes_color_imagencolorid_seq', 1, false);


--
-- TOC entry 5135 (class 0 OID 0)
-- Dependencies: 289
-- Name: producto_imagenes_imagenid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.producto_imagenes_imagenid_seq', 281, true);


--
-- TOC entry 5136 (class 0 OID 0)
-- Dependencies: 292
-- Name: producto_variante_imagenes_imagenid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.producto_variante_imagenes_imagenid_seq', 117, true);


--
-- TOC entry 5137 (class 0 OID 0)
-- Dependencies: 294
-- Name: producto_variantes_varianteid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.producto_variantes_varianteid_seq', 207, true);


--
-- TOC entry 5138 (class 0 OID 0)
-- Dependencies: 296
-- Name: productos_productoid_seq1; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.productos_productoid_seq1', 67, true);


--
-- TOC entry 5139 (class 0 OID 0)
-- Dependencies: 298
-- Name: proveedor_reglas_empaque_reglaid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.proveedor_reglas_empaque_reglaid_seq', 5, true);


--
-- TOC entry 5140 (class 0 OID 0)
-- Dependencies: 300
-- Name: proveedores_proveedorid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.proveedores_proveedorid_seq', 3, true);


--
-- TOC entry 5141 (class 0 OID 0)
-- Dependencies: 302
-- Name: solicitudes_credito_solicitud_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.solicitudes_credito_solicitud_id_seq', 1, false);


--
-- TOC entry 5142 (class 0 OID 0)
-- Dependencies: 318
-- Name: tenants_tenant_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.tenants_tenant_id_seq', 2, true);


--
-- TOC entry 5143 (class 0 OID 0)
-- Dependencies: 304
-- Name: tipoproducto_tipoproductoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.tipoproducto_tipoproductoid_seq', 4, true);


--
-- TOC entry 5144 (class 0 OID 0)
-- Dependencies: 306
-- Name: toma_inventario_conteos_conteoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.toma_inventario_conteos_conteoid_seq', 1, false);


--
-- TOC entry 5145 (class 0 OID 0)
-- Dependencies: 308
-- Name: toma_inventario_sesiones_sesionid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.toma_inventario_sesiones_sesionid_seq', 1, false);


--
-- TOC entry 4416 (class 2606 OID 25387)
-- Name: administradores administradores_email_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.administradores
    ADD CONSTRAINT administradores_email_key UNIQUE (email);


--
-- TOC entry 4418 (class 2606 OID 25389)
-- Name: administradores administradores_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.administradores
    ADD CONSTRAINT administradores_pkey PRIMARY KEY (adminid);


--
-- TOC entry 4420 (class 2606 OID 25391)
-- Name: agentesdeventas agentesdeventas_codigoagente_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.agentesdeventas
    ADD CONSTRAINT agentesdeventas_codigoagente_key UNIQUE (codigoagente);


--
-- TOC entry 4422 (class 2606 OID 25393)
-- Name: agentesdeventas agentesdeventas_email_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.agentesdeventas
    ADD CONSTRAINT agentesdeventas_email_key UNIQUE (email);


--
-- TOC entry 4424 (class 2606 OID 25395)
-- Name: agentesdeventas agentesdeventas_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.agentesdeventas
    ADD CONSTRAINT agentesdeventas_pkey PRIMARY KEY (agenteid);


--
-- TOC entry 4426 (class 2606 OID 25397)
-- Name: carritodecompra carritodecompra_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.carritodecompra
    ADD CONSTRAINT carritodecompra_pkey PRIMARY KEY (carritoid);


--
-- TOC entry 4428 (class 2606 OID 25399)
-- Name: cat_cxp_etiquetas cat_cxp_etiquetas_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_cxp_etiquetas
    ADD CONSTRAINT cat_cxp_etiquetas_pkey PRIMARY KEY (etiqueta_id);


--
-- TOC entry 4430 (class 2606 OID 25401)
-- Name: cat_tamanopaquetes cat_tamanopaquetes_cantidad_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_tamanopaquetes
    ADD CONSTRAINT cat_tamanopaquetes_cantidad_key UNIQUE (cantidad);


--
-- TOC entry 4432 (class 2606 OID 25403)
-- Name: cat_tamanopaquetes cat_tamanopaquetes_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_tamanopaquetes
    ADD CONSTRAINT cat_tamanopaquetes_pkey PRIMARY KEY (tamanoid);


--
-- TOC entry 4434 (class 2606 OID 25405)
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (categoriaid);


--
-- TOC entry 4437 (class 2606 OID 25407)
-- Name: cliente_creditos cliente_creditos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_creditos
    ADD CONSTRAINT cliente_creditos_pkey PRIMARY KEY (credito_id);


--
-- TOC entry 4442 (class 2606 OID 25409)
-- Name: cliente_direcciones cliente_direcciones_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_direcciones
    ADD CONSTRAINT cliente_direcciones_pkey PRIMARY KEY (direccionid);


--
-- TOC entry 4444 (class 2606 OID 25411)
-- Name: clientes clientes_email_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_email_key UNIQUE (email);


--
-- TOC entry 4446 (class 2606 OID 25413)
-- Name: clientes clientes_google_id_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_google_id_key UNIQUE (google_id);


--
-- TOC entry 4448 (class 2606 OID 25415)
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (clienteid);


--
-- TOC entry 4450 (class 2606 OID 25920)
-- Name: clientes clientes_telefono_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_telefono_key UNIQUE (telefono);


--
-- TOC entry 4453 (class 2606 OID 25417)
-- Name: comisiones comisiones_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_pkey PRIMARY KEY (comisionid);


--
-- TOC entry 4455 (class 2606 OID 25419)
-- Name: communicationlogs communicationlogs_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT communicationlogs_pkey PRIMARY KEY (logid);


--
-- TOC entry 4457 (class 2606 OID 25421)
-- Name: control_cambios control_cambios_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.control_cambios
    ADD CONSTRAINT control_cambios_pkey PRIMARY KEY (id);


--
-- TOC entry 4461 (class 2606 OID 25423)
-- Name: credito_movimientos credito_movimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.credito_movimientos
    ADD CONSTRAINT credito_movimientos_pkey PRIMARY KEY (movimiento_id);


--
-- TOC entry 4463 (class 2606 OID 25425)
-- Name: cuentas_por_cobrar cuentas_por_cobrar_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_cobrar
    ADD CONSTRAINT cuentas_por_cobrar_pkey PRIMARY KEY (cxcid);


--
-- TOC entry 4465 (class 2606 OID 25427)
-- Name: cuentas_por_pagar cuentas_por_pagar_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT cuentas_por_pagar_pkey PRIMARY KEY (cxp_id);


--
-- TOC entry 4583 (class 2606 OID 25907)
-- Name: cupones cupones_codigo_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cupones
    ADD CONSTRAINT cupones_codigo_key UNIQUE (codigo);


--
-- TOC entry 4585 (class 2606 OID 25905)
-- Name: cupones cupones_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cupones
    ADD CONSTRAINT cupones_pkey PRIMARY KEY (cuponid);


--
-- TOC entry 4474 (class 2606 OID 25429)
-- Name: cxp_etiquetas_asignadas cxp_etiquetas_asignadas_cxp_id_etiqueta_id_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cxp_etiquetas_asignadas
    ADD CONSTRAINT cxp_etiquetas_asignadas_cxp_id_etiqueta_id_key UNIQUE (cxp_id, etiqueta_id);


--
-- TOC entry 4476 (class 2606 OID 25431)
-- Name: cxp_etiquetas_asignadas cxp_etiquetas_asignadas_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cxp_etiquetas_asignadas
    ADD CONSTRAINT cxp_etiquetas_asignadas_pkey PRIMARY KEY (asignacion_id);


--
-- TOC entry 4478 (class 2606 OID 25433)
-- Name: datos_bancarios_empresa datos_bancarios_empresa_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.datos_bancarios_empresa
    ADD CONSTRAINT datos_bancarios_empresa_pkey PRIMARY KEY (id);


--
-- TOC entry 4481 (class 2606 OID 25435)
-- Name: detallesdelpedido detallesdelpedido_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT detallesdelpedido_pkey PRIMARY KEY (detalleid);


--
-- TOC entry 4483 (class 2606 OID 25437)
-- Name: detallesordencompra detallesordencompra_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra
    ADD CONSTRAINT detallesordencompra_pkey PRIMARY KEY (detalleoc_id);


--
-- TOC entry 4603 (class 2606 OID 26161)
-- Name: developers developers_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.developers
    ADD CONSTRAINT developers_pkey PRIMARY KEY (dev_id);


--
-- TOC entry 4605 (class 2606 OID 26163)
-- Name: developers developers_username_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.developers
    ADD CONSTRAINT developers_username_key UNIQUE (username);


--
-- TOC entry 4491 (class 2606 OID 25439)
-- Name: estados estados_abreviatura_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados
    ADD CONSTRAINT estados_abreviatura_key UNIQUE (abreviatura);


--
-- TOC entry 4493 (class 2606 OID 25441)
-- Name: estados estados_nombre_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados
    ADD CONSTRAINT estados_nombre_key UNIQUE (nombre);


--
-- TOC entry 4495 (class 2606 OID 25443)
-- Name: estados estados_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados
    ADD CONSTRAINT estados_pkey PRIMARY KEY (estadoid);


--
-- TOC entry 4590 (class 2606 OID 25946)
-- Name: inventarios_admin inventarios_admin_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.inventarios_admin
    ADD CONSTRAINT inventarios_admin_pkey PRIMARY KEY (inventario_id);


--
-- TOC entry 4497 (class 2606 OID 25445)
-- Name: itemsdelcarrito itemsdelcarrito_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT itemsdelcarrito_pkey PRIMARY KEY (itemid);


--
-- TOC entry 4595 (class 2606 OID 26125)
-- Name: landing_page_config landing_page_config_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.landing_page_config
    ADD CONSTRAINT landing_page_config_pkey PRIMARY KEY (config_id);


--
-- TOC entry 4597 (class 2606 OID 26127)
-- Name: landing_page_config landing_page_config_section_key_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.landing_page_config
    ADD CONSTRAINT landing_page_config_section_key_key UNIQUE (section_key);


--
-- TOC entry 4503 (class 2606 OID 25447)
-- Name: log_eventosusuario log_eventosusuario_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario
    ADD CONSTRAINT log_eventosusuario_pkey PRIMARY KEY (eventoid);


--
-- TOC entry 4508 (class 2606 OID 25449)
-- Name: log_inventario log_inventario_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_inventario
    ADD CONSTRAINT log_inventario_pkey PRIMARY KEY (logid);


--
-- TOC entry 4514 (class 2606 OID 25451)
-- Name: log_movimientos log_movimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_movimientos
    ADD CONSTRAINT log_movimientos_pkey PRIMARY KEY (logid);


--
-- TOC entry 4517 (class 2606 OID 25453)
-- Name: medidas medidas_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas
    ADD CONSTRAINT medidas_pkey PRIMARY KEY (medidaid);


--
-- TOC entry 4519 (class 2606 OID 25455)
-- Name: medidas medidas_tipoproductoid_nombremedida_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas
    ADD CONSTRAINT medidas_tipoproductoid_nombremedida_key UNIQUE (tipoproductoid, nombremedida);


--
-- TOC entry 4489 (class 2606 OID 25457)
-- Name: notificaciones notificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_pkey PRIMARY KEY (notificacionid);


--
-- TOC entry 4523 (class 2606 OID 25459)
-- Name: ordenesdecompra ordenesdecompra_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.ordenesdecompra
    ADD CONSTRAINT ordenesdecompra_pkey PRIMARY KEY (ordencompraid);


--
-- TOC entry 4529 (class 2606 OID 25461)
-- Name: pagos_clientes pagos_clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_clientes
    ADD CONSTRAINT pagos_clientes_pkey PRIMARY KEY (pago_id);


--
-- TOC entry 4532 (class 2606 OID 25463)
-- Name: pagos_cxp pagos_cxp_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_cxp
    ADD CONSTRAINT pagos_cxp_pkey PRIMARY KEY (pago_id);


--
-- TOC entry 4534 (class 2606 OID 25465)
-- Name: passwordresettokens passwordresettokens_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT passwordresettokens_pkey PRIMARY KEY (tokenid);


--
-- TOC entry 4536 (class 2606 OID 25467)
-- Name: passwordresettokens passwordresettokens_token_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT passwordresettokens_token_key UNIQUE (token);


--
-- TOC entry 4538 (class 2606 OID 25469)
-- Name: pedidos pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_pkey PRIMARY KEY (pedidoid);


--
-- TOC entry 4581 (class 2606 OID 25885)
-- Name: producto_imagenes_color producto_imagenes_color_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_imagenes_color
    ADD CONSTRAINT producto_imagenes_color_pkey PRIMARY KEY (imagencolorid);


--
-- TOC entry 4540 (class 2606 OID 25471)
-- Name: producto_imagenes producto_imagenes_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_imagenes
    ADD CONSTRAINT producto_imagenes_pkey PRIMARY KEY (imagenid);


--
-- TOC entry 4542 (class 2606 OID 25473)
-- Name: producto_tamanosdisponibles producto_tamanosdisponibles_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_tamanosdisponibles
    ADD CONSTRAINT producto_tamanosdisponibles_pkey PRIMARY KEY (productoid, tamanoid);


--
-- TOC entry 4546 (class 2606 OID 25475)
-- Name: producto_variante_imagenes producto_variante_imagenes_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variante_imagenes
    ADD CONSTRAINT producto_variante_imagenes_pkey PRIMARY KEY (imagenid);


--
-- TOC entry 4551 (class 2606 OID 25477)
-- Name: producto_variantes productos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_pkey PRIMARY KEY (varianteid);


--
-- TOC entry 4557 (class 2606 OID 25479)
-- Name: productos productos_pkey1; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey1 PRIMARY KEY (productoid);


--
-- TOC entry 4553 (class 2606 OID 25481)
-- Name: producto_variantes productos_sku_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_sku_key UNIQUE (sku);


--
-- TOC entry 4559 (class 2606 OID 25483)
-- Name: productos productos_sku_maestro_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_sku_maestro_key UNIQUE (sku_maestro);


--
-- TOC entry 4561 (class 2606 OID 25485)
-- Name: proveedor_reglas_empaque proveedor_reglas_empaque_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedor_reglas_empaque
    ADD CONSTRAINT proveedor_reglas_empaque_pkey PRIMARY KEY (reglaid);


--
-- TOC entry 4563 (class 2606 OID 25487)
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (proveedorid);


--
-- TOC entry 4565 (class 2606 OID 25489)
-- Name: solicitudes_credito solicitudes_credito_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.solicitudes_credito
    ADD CONSTRAINT solicitudes_credito_pkey PRIMARY KEY (solicitud_id);


--
-- TOC entry 4599 (class 2606 OID 26153)
-- Name: tenants tenants_dominio_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_dominio_key UNIQUE (dominio);


--
-- TOC entry 4601 (class 2606 OID 26151)
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (tenant_id);


--
-- TOC entry 4567 (class 2606 OID 25491)
-- Name: tipoproducto tipoproducto_nombre_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.tipoproducto
    ADD CONSTRAINT tipoproducto_nombre_key UNIQUE (nombre);


--
-- TOC entry 4569 (class 2606 OID 25493)
-- Name: tipoproducto tipoproducto_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.tipoproducto
    ADD CONSTRAINT tipoproducto_pkey PRIMARY KEY (tipoproductoid);


--
-- TOC entry 4574 (class 2606 OID 25495)
-- Name: toma_inventario_conteos toma_inventario_conteos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_conteos
    ADD CONSTRAINT toma_inventario_conteos_pkey PRIMARY KEY (conteoid);


--
-- TOC entry 4578 (class 2606 OID 25497)
-- Name: toma_inventario_sesiones toma_inventario_sesiones_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_sesiones
    ADD CONSTRAINT toma_inventario_sesiones_pkey PRIMARY KEY (sesionid);


--
-- TOC entry 4592 (class 2606 OID 25948)
-- Name: inventarios_admin uk_admin_variante; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.inventarios_admin
    ADD CONSTRAINT uk_admin_variante UNIQUE (admin_id, variante_id);


--
-- TOC entry 4440 (class 2606 OID 25499)
-- Name: cliente_creditos unique_cliente_credito; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_creditos
    ADD CONSTRAINT unique_cliente_credito UNIQUE (cliente_id);


--
-- TOC entry 4472 (class 2606 OID 25501)
-- Name: cuentas_por_pagar unq_orden_referencia; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT unq_orden_referencia UNIQUE (orden_compra_id, referencia_factura);


--
-- TOC entry 4576 (class 2606 OID 25503)
-- Name: toma_inventario_conteos unq_sesion_variante; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_conteos
    ADD CONSTRAINT unq_sesion_variante UNIQUE (sesionid, varianteid);


--
-- TOC entry 4435 (class 1259 OID 25504)
-- Name: idx_categoria_activo; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_categoria_activo ON public.categorias USING btree (activo);


--
-- TOC entry 4451 (class 1259 OID 25505)
-- Name: idx_cliente_agente; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cliente_agente ON public.clientes USING btree (agenteid);


--
-- TOC entry 4438 (class 1259 OID 25506)
-- Name: idx_cliente_creditos_exportacion; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cliente_creditos_exportacion ON public.cliente_creditos USING btree (exportado_en) WHERE (exportado_en IS NULL);


--
-- TOC entry 4570 (class 1259 OID 25507)
-- Name: idx_conteos_estatus; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_conteos_estatus ON public.toma_inventario_conteos USING btree (estatus_fila);


--
-- TOC entry 4571 (class 1259 OID 25508)
-- Name: idx_conteos_estatus_aplicacion; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_conteos_estatus_aplicacion ON public.toma_inventario_conteos USING btree (estatus_aplicacion);


--
-- TOC entry 4572 (class 1259 OID 25509)
-- Name: idx_conteos_sesion; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_conteos_sesion ON public.toma_inventario_conteos USING btree (sesionid);


--
-- TOC entry 4458 (class 1259 OID 25510)
-- Name: idx_control_cambios_entidad; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_control_cambios_entidad ON public.control_cambios USING btree (entidad, entidad_id);


--
-- TOC entry 4459 (class 1259 OID 25511)
-- Name: idx_control_cambios_estado; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_control_cambios_estado ON public.control_cambios USING btree (estado);


--
-- TOC entry 4466 (class 1259 OID 25512)
-- Name: idx_cxp_estatus; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cxp_estatus ON public.cuentas_por_pagar USING btree (estatus);


--
-- TOC entry 4467 (class 1259 OID 25513)
-- Name: idx_cxp_exportacion; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cxp_exportacion ON public.cuentas_por_pagar USING btree (exportado_en) WHERE (exportado_en IS NULL);


--
-- TOC entry 4468 (class 1259 OID 25514)
-- Name: idx_cxp_fecha_cierre; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cxp_fecha_cierre ON public.cuentas_por_pagar USING btree (fecha_cierre);


--
-- TOC entry 4469 (class 1259 OID 25515)
-- Name: idx_cxp_proveedor; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cxp_proveedor ON public.cuentas_por_pagar USING btree (proveedor_id);


--
-- TOC entry 4470 (class 1259 OID 25516)
-- Name: idx_cxp_vencimiento; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cxp_vencimiento ON public.cuentas_por_pagar USING btree (fecha_vencimiento);


--
-- TOC entry 4479 (class 1259 OID 25517)
-- Name: idx_datos_bancarios_principal; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_datos_bancarios_principal ON public.datos_bancarios_empresa USING btree (es_principal) WHERE (es_principal = true);


--
-- TOC entry 4586 (class 1259 OID 25959)
-- Name: idx_inventarios_admin_admin_id; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_inventarios_admin_admin_id ON public.inventarios_admin USING btree (admin_id);


--
-- TOC entry 4587 (class 1259 OID 25961)
-- Name: idx_inventarios_admin_cantidad; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_inventarios_admin_cantidad ON public.inventarios_admin USING btree (cantidad) WHERE (cantidad > 0);


--
-- TOC entry 4588 (class 1259 OID 25960)
-- Name: idx_inventarios_admin_variante_id; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_inventarios_admin_variante_id ON public.inventarios_admin USING btree (variante_id);


--
-- TOC entry 4593 (class 1259 OID 26128)
-- Name: idx_landing_config_section; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_landing_config_section ON public.landing_page_config USING btree (section_key);


--
-- TOC entry 4509 (class 1259 OID 25518)
-- Name: idx_log_accion; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_accion ON public.log_movimientos USING btree (accion);


--
-- TOC entry 4498 (class 1259 OID 25519)
-- Name: idx_log_clienteid; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_clienteid ON public.log_eventosusuario USING btree (clienteid);


--
-- TOC entry 4510 (class 1259 OID 25520)
-- Name: idx_log_entidad; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_entidad ON public.log_movimientos USING btree (entidad, entidadid);


--
-- TOC entry 4511 (class 1259 OID 25521)
-- Name: idx_log_fecha; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_fecha ON public.log_movimientos USING btree (fecha DESC);


--
-- TOC entry 4504 (class 1259 OID 25522)
-- Name: idx_log_inventario_cxp; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_inventario_cxp ON public.log_inventario USING btree (cxp_id);


--
-- TOC entry 4505 (class 1259 OID 25523)
-- Name: idx_log_inventario_cxp_id; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_inventario_cxp_id ON public.log_inventario USING btree (cxp_id);


--
-- TOC entry 4506 (class 1259 OID 25524)
-- Name: idx_log_inventario_excepcion; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_inventario_excepcion ON public.log_inventario USING btree (es_excepcion);


--
-- TOC entry 4499 (class 1259 OID 25525)
-- Name: idx_log_timestamp; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_timestamp ON public.log_eventosusuario USING btree ("timestamp");


--
-- TOC entry 4500 (class 1259 OID 25526)
-- Name: idx_log_tipoevento; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_tipoevento ON public.log_eventosusuario USING btree (tipoevento);


--
-- TOC entry 4512 (class 1259 OID 25527)
-- Name: idx_log_usuario; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_usuario ON public.log_movimientos USING btree (usuarioid);


--
-- TOC entry 4501 (class 1259 OID 25528)
-- Name: idx_log_varianteid; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_varianteid ON public.log_eventosusuario USING btree (varianteid);


--
-- TOC entry 4515 (class 1259 OID 25529)
-- Name: idx_medidas_tipoproducto; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_medidas_tipoproducto ON public.medidas USING btree (tipoproductoid);


--
-- TOC entry 4484 (class 1259 OID 25530)
-- Name: idx_notificaciones_clienteid; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_clienteid ON public.notificaciones USING btree (clienteid);


--
-- TOC entry 4485 (class 1259 OID 25531)
-- Name: idx_notificaciones_fecha; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_fecha ON public.notificaciones USING btree (fechacreacion DESC);


--
-- TOC entry 4486 (class 1259 OID 25532)
-- Name: idx_notificaciones_leida; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_leida ON public.notificaciones USING btree (leida);


--
-- TOC entry 4487 (class 1259 OID 25533)
-- Name: idx_notificaciones_tipo; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_tipo ON public.notificaciones USING btree (tipo);


--
-- TOC entry 4520 (class 1259 OID 25534)
-- Name: idx_ordenes_exportacion_pendientes; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_ordenes_exportacion_pendientes ON public.ordenesdecompra USING btree (exportado_en) WHERE (exportado_en IS NULL);


--
-- TOC entry 4521 (class 1259 OID 25535)
-- Name: idx_ordenesdecompra_origenoc; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_ordenesdecompra_origenoc ON public.ordenesdecompra USING btree (origenoc);


--
-- TOC entry 4524 (class 1259 OID 25536)
-- Name: idx_pagos_clientes_cliente; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_pagos_clientes_cliente ON public.pagos_clientes USING btree (cliente_id);


--
-- TOC entry 4525 (class 1259 OID 25537)
-- Name: idx_pagos_clientes_credito; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_pagos_clientes_credito ON public.pagos_clientes USING btree (credito_id);


--
-- TOC entry 4526 (class 1259 OID 25538)
-- Name: idx_pagos_clientes_estatus; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_pagos_clientes_estatus ON public.pagos_clientes USING btree (estatus);


--
-- TOC entry 4527 (class 1259 OID 25539)
-- Name: idx_pagos_clientes_fecha; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_pagos_clientes_fecha ON public.pagos_clientes USING btree (fecha_pago DESC);


--
-- TOC entry 4530 (class 1259 OID 25540)
-- Name: idx_pagos_historial; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_pagos_historial ON public.pagos_cxp USING btree (cxp_id);


--
-- TOC entry 4554 (class 1259 OID 25541)
-- Name: idx_producto_activo; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_producto_activo ON public.productos USING btree (activo);


--
-- TOC entry 4579 (class 1259 OID 25891)
-- Name: idx_producto_color_busqueda; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_producto_color_busqueda ON public.producto_imagenes_color USING btree (productoid, color_nombre);


--
-- TOC entry 4547 (class 1259 OID 25542)
-- Name: idx_producto_oferta; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_producto_oferta ON public.producto_variantes USING btree (precioofertaunitario) WHERE (precioofertaunitario IS NOT NULL);


--
-- TOC entry 4543 (class 1259 OID 25543)
-- Name: idx_producto_variante_imagenes_varianteid; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_producto_variante_imagenes_varianteid ON public.producto_variante_imagenes USING btree (varianteid);


--
-- TOC entry 4544 (class 1259 OID 25544)
-- Name: idx_producto_variante_imagenes_varianteid_orden; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_producto_variante_imagenes_varianteid_orden ON public.producto_variante_imagenes USING btree (varianteid, orden);


--
-- TOC entry 4555 (class 1259 OID 25935)
-- Name: idx_productos_admin_creator; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_productos_admin_creator ON public.productos USING btree (created_by_admin_id);


--
-- TOC entry 4548 (class 1259 OID 25545)
-- Name: idx_productos_tipoproducto; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_productos_tipoproducto ON public.producto_variantes USING btree (tipoproductoid);


--
-- TOC entry 4549 (class 1259 OID 25546)
-- Name: idx_variantes_color_nombre; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_variantes_color_nombre ON public.producto_variantes USING btree (color_nombre);


--
-- TOC entry 4680 (class 2620 OID 25963)
-- Name: inventarios_admin trg_update_inventarios_admin_timestamp; Type: TRIGGER; Schema: public; Owner: ferram
--

CREATE TRIGGER trg_update_inventarios_admin_timestamp BEFORE UPDATE ON public.inventarios_admin FOR EACH ROW EXECUTE FUNCTION public.update_inventarios_admin_timestamp();


--
-- TOC entry 4679 (class 2620 OID 25547)
-- Name: notificaciones trigger_limitar_notificaciones; Type: TRIGGER; Schema: public; Owner: ferram
--

CREATE TRIGGER trigger_limitar_notificaciones AFTER INSERT ON public.notificaciones FOR EACH ROW EXECUTE FUNCTION public.limitar_notificaciones_por_cliente();


--
-- TOC entry 4678 (class 2620 OID 25548)
-- Name: cliente_creditos trigger_update_credito_fecha; Type: TRIGGER; Schema: public; Owner: ferram
--

CREATE TRIGGER trigger_update_credito_fecha BEFORE UPDATE ON public.cliente_creditos FOR EACH ROW EXECUTE FUNCTION public.update_ultima_actualizacion();


--
-- TOC entry 4681 (class 2620 OID 26130)
-- Name: landing_page_config trigger_update_landing_config_timestamp; Type: TRIGGER; Schema: public; Owner: ferram
--

CREATE TRIGGER trigger_update_landing_config_timestamp BEFORE UPDATE ON public.landing_page_config FOR EACH ROW EXECUTE FUNCTION public.update_landing_config_timestamp();


--
-- TOC entry 4606 (class 2606 OID 25549)
-- Name: carritodecompra carritodecompra_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.carritodecompra
    ADD CONSTRAINT carritodecompra_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 4607 (class 2606 OID 25554)
-- Name: categorias categorias_parentcategoriaid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_parentcategoriaid_fkey FOREIGN KEY (parentcategoriaid) REFERENCES public.categorias(categoriaid);


--
-- TOC entry 4609 (class 2606 OID 25559)
-- Name: cliente_direcciones cliente_direcciones_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_direcciones
    ADD CONSTRAINT cliente_direcciones_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 4612 (class 2606 OID 25564)
-- Name: comisiones comisiones_agenteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_agenteid_fkey FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid);


--
-- TOC entry 4613 (class 2606 OID 25569)
-- Name: comisiones comisiones_pedidoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_pedidoid_fkey FOREIGN KEY (pedidoid) REFERENCES public.pedidos(pedidoid);


--
-- TOC entry 4620 (class 2606 OID 25574)
-- Name: cuentas_por_cobrar cuentas_por_cobrar_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_cobrar
    ADD CONSTRAINT cuentas_por_cobrar_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(clienteid);


--
-- TOC entry 4621 (class 2606 OID 25579)
-- Name: cuentas_por_cobrar cuentas_por_cobrar_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_cobrar
    ADD CONSTRAINT cuentas_por_cobrar_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(pedidoid);


--
-- TOC entry 4622 (class 2606 OID 25584)
-- Name: cuentas_por_pagar cuentas_por_pagar_orden_compra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT cuentas_por_pagar_orden_compra_id_fkey FOREIGN KEY (orden_compra_id) REFERENCES public.ordenesdecompra(ordencompraid);


--
-- TOC entry 4623 (class 2606 OID 25589)
-- Name: cuentas_por_pagar cuentas_por_pagar_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT cuentas_por_pagar_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 4674 (class 2606 OID 25914)
-- Name: cupones cupones_agente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cupones
    ADD CONSTRAINT cupones_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.agentesdeventas(agenteid) ON DELETE SET NULL;


--
-- TOC entry 4624 (class 2606 OID 25594)
-- Name: cxp_etiquetas_asignadas cxp_etiquetas_asignadas_cxp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cxp_etiquetas_asignadas
    ADD CONSTRAINT cxp_etiquetas_asignadas_cxp_id_fkey FOREIGN KEY (cxp_id) REFERENCES public.cuentas_por_pagar(cxp_id) ON DELETE CASCADE;


--
-- TOC entry 4625 (class 2606 OID 25599)
-- Name: cxp_etiquetas_asignadas cxp_etiquetas_asignadas_etiqueta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cxp_etiquetas_asignadas
    ADD CONSTRAINT cxp_etiquetas_asignadas_etiqueta_id_fkey FOREIGN KEY (etiqueta_id) REFERENCES public.cat_cxp_etiquetas(etiqueta_id);


--
-- TOC entry 4626 (class 2606 OID 25604)
-- Name: detallesdelpedido detallesdelpedido_pedidoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT detallesdelpedido_pedidoid_fkey FOREIGN KEY (pedidoid) REFERENCES public.pedidos(pedidoid);


--
-- TOC entry 4629 (class 2606 OID 25609)
-- Name: detallesordencompra detallesordencompra_ordencompraid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra
    ADD CONSTRAINT detallesordencompra_ordencompraid_fkey FOREIGN KEY (ordencompraid) REFERENCES public.ordenesdecompra(ordencompraid);


--
-- TOC entry 4617 (class 2606 OID 25614)
-- Name: credito_movimientos fk_admin_registro; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.credito_movimientos
    ADD CONSTRAINT fk_admin_registro FOREIGN KEY (admin_id) REFERENCES public.administradores(adminid) ON DELETE SET NULL;


--
-- TOC entry 4618 (class 2606 OID 25619)
-- Name: credito_movimientos fk_agente_registro; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.credito_movimientos
    ADD CONSTRAINT fk_agente_registro FOREIGN KEY (agente_id) REFERENCES public.agentesdeventas(agenteid) ON DELETE SET NULL;


--
-- TOC entry 4614 (class 2606 OID 25624)
-- Name: communicationlogs fk_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT fk_cliente FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 4611 (class 2606 OID 25629)
-- Name: clientes fk_cliente_agente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT fk_cliente_agente FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid);


--
-- TOC entry 4608 (class 2606 OID 25634)
-- Name: cliente_creditos fk_cliente_credito; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_creditos
    ADD CONSTRAINT fk_cliente_credito FOREIGN KEY (cliente_id) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 4610 (class 2606 OID 25639)
-- Name: cliente_direcciones fk_cliente_estado; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_direcciones
    ADD CONSTRAINT fk_cliente_estado FOREIGN KEY (estadoid) REFERENCES public.estados(estadoid);


--
-- TOC entry 4627 (class 2606 OID 25644)
-- Name: detallesdelpedido fk_detalles_tamano; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT fk_detalles_tamano FOREIGN KEY (tamanoid) REFERENCES public.cat_tamanopaquetes(tamanoid);


--
-- TOC entry 4628 (class 2606 OID 25649)
-- Name: detallesdelpedido fk_detallesdelpedido_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT fk_detallesdelpedido_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 4630 (class 2606 OID 25654)
-- Name: detallesordencompra fk_detallesordencompra_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra
    ADD CONSTRAINT fk_detallesordencompra_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 4656 (class 2606 OID 25659)
-- Name: producto_imagenes fk_imagen_producto_maestro; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_imagenes
    ADD CONSTRAINT fk_imagen_producto_maestro FOREIGN KEY (productoid) REFERENCES public.productos(productoid) ON DELETE CASCADE;


--
-- TOC entry 4673 (class 2606 OID 25886)
-- Name: producto_imagenes_color fk_imagencolor_producto; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_imagenes_color
    ADD CONSTRAINT fk_imagencolor_producto FOREIGN KEY (productoid) REFERENCES public.productos(productoid) ON DELETE CASCADE;


--
-- TOC entry 4675 (class 2606 OID 25949)
-- Name: inventarios_admin fk_inventarios_admin_admin; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.inventarios_admin
    ADD CONSTRAINT fk_inventarios_admin_admin FOREIGN KEY (admin_id) REFERENCES public.administradores(adminid) ON DELETE CASCADE;


--
-- TOC entry 4676 (class 2606 OID 25966)
-- Name: inventarios_admin fk_inventarios_admin_registrado_por; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.inventarios_admin
    ADD CONSTRAINT fk_inventarios_admin_registrado_por FOREIGN KEY (registrado_por) REFERENCES public.administradores(adminid) ON DELETE SET NULL;


--
-- TOC entry 4677 (class 2606 OID 25954)
-- Name: inventarios_admin fk_inventarios_admin_variante; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.inventarios_admin
    ADD CONSTRAINT fk_inventarios_admin_variante FOREIGN KEY (variante_id) REFERENCES public.producto_variantes(varianteid) ON DELETE CASCADE;


--
-- TOC entry 4634 (class 2606 OID 25664)
-- Name: itemsdelcarrito fk_items_tamano; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT fk_items_tamano FOREIGN KEY (tamanoid) REFERENCES public.cat_tamanopaquetes(tamanoid);


--
-- TOC entry 4635 (class 2606 OID 25669)
-- Name: itemsdelcarrito fk_itemsdelcarrito_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT fk_itemsdelcarrito_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 4637 (class 2606 OID 25674)
-- Name: log_eventosusuario fk_log_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario
    ADD CONSTRAINT fk_log_cliente FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 4641 (class 2606 OID 25679)
-- Name: log_movimientos fk_log_usuario; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_movimientos
    ADD CONSTRAINT fk_log_usuario FOREIGN KEY (usuarioid) REFERENCES public.administradores(adminid) ON DELETE SET NULL;


--
-- TOC entry 4638 (class 2606 OID 25684)
-- Name: log_eventosusuario fk_log_variante; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario
    ADD CONSTRAINT fk_log_variante FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 4639 (class 2606 OID 25689)
-- Name: log_inventario fk_loginventario_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_inventario
    ADD CONSTRAINT fk_loginventario_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 4619 (class 2606 OID 25694)
-- Name: credito_movimientos fk_movimiento_credito; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.credito_movimientos
    ADD CONSTRAINT fk_movimiento_credito FOREIGN KEY (credito_id) REFERENCES public.cliente_creditos(credito_id) ON DELETE CASCADE;


--
-- TOC entry 4645 (class 2606 OID 25699)
-- Name: pagos_clientes fk_pagos_clientes_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_clientes
    ADD CONSTRAINT fk_pagos_clientes_cliente FOREIGN KEY (cliente_id) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 4646 (class 2606 OID 25704)
-- Name: pagos_clientes fk_pagos_clientes_credito; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_clientes
    ADD CONSTRAINT fk_pagos_clientes_credito FOREIGN KEY (credito_id) REFERENCES public.cliente_creditos(credito_id) ON DELETE SET NULL;


--
-- TOC entry 4647 (class 2606 OID 25709)
-- Name: pagos_clientes fk_pagos_clientes_validador; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_clientes
    ADD CONSTRAINT fk_pagos_clientes_validador FOREIGN KEY (validado_por) REFERENCES public.administradores(adminid) ON DELETE SET NULL;


--
-- TOC entry 4648 (class 2606 OID 25714)
-- Name: pagos_cxp fk_pagos_cxp; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_cxp
    ADD CONSTRAINT fk_pagos_cxp FOREIGN KEY (cxp_id) REFERENCES public.cuentas_por_pagar(cxp_id) ON DELETE CASCADE;


--
-- TOC entry 4649 (class 2606 OID 25719)
-- Name: pagos_cxp fk_pagos_usuario; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_cxp
    ADD CONSTRAINT fk_pagos_usuario FOREIGN KEY (usuario_id) REFERENCES public.administradores(adminid);


--
-- TOC entry 4650 (class 2606 OID 25724)
-- Name: passwordresettokens fk_passwordreset_agente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT fk_passwordreset_agente FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid) ON DELETE CASCADE;


--
-- TOC entry 4651 (class 2606 OID 25729)
-- Name: passwordresettokens fk_passwordreset_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT fk_passwordreset_cliente FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 4615 (class 2606 OID 25734)
-- Name: communicationlogs fk_pedido; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT fk_pedido FOREIGN KEY (pedidoid) REFERENCES public.pedidos(pedidoid);


--
-- TOC entry 4663 (class 2606 OID 25930)
-- Name: productos fk_producto_admin_creator; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT fk_producto_admin_creator FOREIGN KEY (created_by_admin_id) REFERENCES public.administradores(adminid) ON DELETE SET NULL;


--
-- TOC entry 4660 (class 2606 OID 25739)
-- Name: producto_variantes fk_producto_maestro; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT fk_producto_maestro FOREIGN KEY (productoid) REFERENCES public.productos(productoid);


--
-- TOC entry 4664 (class 2606 OID 25744)
-- Name: productos fk_producto_regla_empaque; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT fk_producto_regla_empaque FOREIGN KEY (reglaid) REFERENCES public.proveedor_reglas_empaque(reglaid);


--
-- TOC entry 4616 (class 2606 OID 25749)
-- Name: communicationlogs fk_proveedor; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT fk_proveedor FOREIGN KEY (proveedorid) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 4665 (class 2606 OID 25754)
-- Name: productos fk_proveedor_default; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT fk_proveedor_default FOREIGN KEY (proveedorid_default) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 4667 (class 2606 OID 25759)
-- Name: proveedor_reglas_empaque fk_regla_proveedor; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedor_reglas_empaque
    ADD CONSTRAINT fk_regla_proveedor FOREIGN KEY (proveedorid) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 4668 (class 2606 OID 25764)
-- Name: proveedor_reglas_empaque fk_regla_tipo; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedor_reglas_empaque
    ADD CONSTRAINT fk_regla_tipo FOREIGN KEY (tipoproductoid) REFERENCES public.tipoproducto(tipoproductoid);


--
-- TOC entry 4669 (class 2606 OID 25769)
-- Name: solicitudes_credito fk_solicitud_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.solicitudes_credito
    ADD CONSTRAINT fk_solicitud_cliente FOREIGN KEY (cliente_id) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 4657 (class 2606 OID 25774)
-- Name: producto_tamanosdisponibles fk_tamanos_producto; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_tamanosdisponibles
    ADD CONSTRAINT fk_tamanos_producto FOREIGN KEY (productoid) REFERENCES public.productos(productoid);


--
-- TOC entry 4658 (class 2606 OID 25779)
-- Name: producto_tamanosdisponibles fk_tamanos_tamano; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_tamanosdisponibles
    ADD CONSTRAINT fk_tamanos_tamano FOREIGN KEY (tamanoid) REFERENCES public.cat_tamanopaquetes(tamanoid);


--
-- TOC entry 4636 (class 2606 OID 25784)
-- Name: itemsdelcarrito itemsdelcarrito_carritoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT itemsdelcarrito_carritoid_fkey FOREIGN KEY (carritoid) REFERENCES public.carritodecompra(carritoid);


--
-- TOC entry 4640 (class 2606 OID 25789)
-- Name: log_inventario log_inventario_cxp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_inventario
    ADD CONSTRAINT log_inventario_cxp_id_fkey FOREIGN KEY (cxp_id) REFERENCES public.cuentas_por_pagar(cxp_id) ON DELETE SET NULL;


--
-- TOC entry 4642 (class 2606 OID 25794)
-- Name: medidas medidas_tipoproductoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas
    ADD CONSTRAINT medidas_tipoproductoid_fkey FOREIGN KEY (tipoproductoid) REFERENCES public.tipoproducto(tipoproductoid);


--
-- TOC entry 4631 (class 2606 OID 25799)
-- Name: notificaciones notificaciones_administrador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_administrador_id_fkey FOREIGN KEY (administrador_id) REFERENCES public.administradores(adminid) ON DELETE CASCADE;


--
-- TOC entry 4632 (class 2606 OID 25804)
-- Name: notificaciones notificaciones_agente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.agentesdeventas(agenteid) ON DELETE CASCADE;


--
-- TOC entry 4633 (class 2606 OID 25809)
-- Name: notificaciones notificaciones_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 4643 (class 2606 OID 25814)
-- Name: ordenesdecompra ordenesdecompra_proveedorid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.ordenesdecompra
    ADD CONSTRAINT ordenesdecompra_proveedorid_fkey FOREIGN KEY (proveedorid) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 4644 (class 2606 OID 25819)
-- Name: ordenesdecompra ordenesdecompra_usuario_creador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.ordenesdecompra
    ADD CONSTRAINT ordenesdecompra_usuario_creador_id_fkey FOREIGN KEY (usuario_creador_id) REFERENCES public.administradores(adminid);


--
-- TOC entry 4652 (class 2606 OID 25824)
-- Name: pedidos pedidos_agenteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_agenteid_fkey FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid);


--
-- TOC entry 4653 (class 2606 OID 25829)
-- Name: pedidos pedidos_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 4654 (class 2606 OID 25908)
-- Name: pedidos pedidos_cupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_cupon_id_fkey FOREIGN KEY (cupon_id) REFERENCES public.cupones(cuponid);


--
-- TOC entry 4655 (class 2606 OID 25834)
-- Name: pedidos pedidos_direccionenvioid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_direccionenvioid_fkey FOREIGN KEY (direccionenvioid) REFERENCES public.cliente_direcciones(direccionid);


--
-- TOC entry 4659 (class 2606 OID 25839)
-- Name: producto_variante_imagenes producto_variante_imagenes_varianteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variante_imagenes
    ADD CONSTRAINT producto_variante_imagenes_varianteid_fkey FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid) ON DELETE CASCADE;


--
-- TOC entry 4666 (class 2606 OID 25844)
-- Name: productos productos_categoriaid_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_categoriaid_fkey1 FOREIGN KEY (categoriaid) REFERENCES public.categorias(categoriaid);


--
-- TOC entry 4661 (class 2606 OID 25849)
-- Name: producto_variantes productos_medidaid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_medidaid_fkey FOREIGN KEY (medidaid) REFERENCES public.medidas(medidaid);


--
-- TOC entry 4662 (class 2606 OID 25854)
-- Name: producto_variantes productos_tipoproductoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_tipoproductoid_fkey FOREIGN KEY (tipoproductoid) REFERENCES public.tipoproducto(tipoproductoid);


--
-- TOC entry 4670 (class 2606 OID 25859)
-- Name: toma_inventario_conteos toma_inventario_conteos_sesionid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_conteos
    ADD CONSTRAINT toma_inventario_conteos_sesionid_fkey FOREIGN KEY (sesionid) REFERENCES public.toma_inventario_sesiones(sesionid) ON DELETE CASCADE;


--
-- TOC entry 4671 (class 2606 OID 25864)
-- Name: toma_inventario_conteos toma_inventario_conteos_varianteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_conteos
    ADD CONSTRAINT toma_inventario_conteos_varianteid_fkey FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 4672 (class 2606 OID 25869)
-- Name: toma_inventario_sesiones toma_inventario_sesiones_usuario_creador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_sesiones
    ADD CONSTRAINT toma_inventario_sesiones_usuario_creador_id_fkey FOREIGN KEY (usuario_creador_id) REFERENCES public.administradores(adminid);


--
-- TOC entry 4930 (class 0 OID 0)
-- Dependencies: 9
-- Name: SCHEMA cron; Type: ACL; Schema: -; Owner: azuresu
--

GRANT USAGE ON SCHEMA cron TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4933 (class 0 OID 0)
-- Dependencies: 357
-- Name: FUNCTION alter_job(job_id bigint, schedule text, command text, database text, username text, active boolean); Type: ACL; Schema: cron; Owner: azuresu
--

GRANT ALL ON FUNCTION cron.alter_job(job_id bigint, schedule text, command text, database text, username text, active boolean) TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4934 (class 0 OID 0)
-- Dependencies: 356
-- Name: FUNCTION job_cache_invalidate(); Type: ACL; Schema: cron; Owner: azuresu
--

GRANT ALL ON FUNCTION cron.job_cache_invalidate() TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4935 (class 0 OID 0)
-- Dependencies: 354
-- Name: FUNCTION schedule(schedule text, command text); Type: ACL; Schema: cron; Owner: azuresu
--

GRANT ALL ON FUNCTION cron.schedule(schedule text, command text) TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4936 (class 0 OID 0)
-- Dependencies: 328
-- Name: FUNCTION schedule(job_name text, schedule text, command text); Type: ACL; Schema: cron; Owner: azuresu
--

GRANT ALL ON FUNCTION cron.schedule(job_name text, schedule text, command text) TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4937 (class 0 OID 0)
-- Dependencies: 358
-- Name: FUNCTION schedule_in_database(job_name text, schedule text, command text, database text, username text, active boolean); Type: ACL; Schema: cron; Owner: azuresu
--

GRANT ALL ON FUNCTION cron.schedule_in_database(job_name text, schedule text, command text, database text, username text, active boolean) TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4938 (class 0 OID 0)
-- Dependencies: 355
-- Name: FUNCTION unschedule(job_id bigint); Type: ACL; Schema: cron; Owner: azuresu
--

GRANT ALL ON FUNCTION cron.unschedule(job_id bigint) TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4939 (class 0 OID 0)
-- Dependencies: 359
-- Name: FUNCTION unschedule(job_name text); Type: ACL; Schema: cron; Owner: azuresu
--

GRANT ALL ON FUNCTION cron.unschedule(job_name text) TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4940 (class 0 OID 0)
-- Dependencies: 329
-- Name: FUNCTION pg_replication_origin_advance(text, pg_lsn); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_advance(text, pg_lsn) TO azure_pg_admin;


--
-- TOC entry 4941 (class 0 OID 0)
-- Dependencies: 330
-- Name: FUNCTION pg_replication_origin_create(text); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_create(text) TO azure_pg_admin;


--
-- TOC entry 4942 (class 0 OID 0)
-- Dependencies: 331
-- Name: FUNCTION pg_replication_origin_drop(text); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_drop(text) TO azure_pg_admin;


--
-- TOC entry 4943 (class 0 OID 0)
-- Dependencies: 322
-- Name: FUNCTION pg_replication_origin_oid(text); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_oid(text) TO azure_pg_admin;


--
-- TOC entry 4944 (class 0 OID 0)
-- Dependencies: 323
-- Name: FUNCTION pg_replication_origin_progress(text, boolean); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_progress(text, boolean) TO azure_pg_admin;


--
-- TOC entry 4945 (class 0 OID 0)
-- Dependencies: 332
-- Name: FUNCTION pg_replication_origin_session_is_setup(); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_session_is_setup() TO azure_pg_admin;


--
-- TOC entry 4946 (class 0 OID 0)
-- Dependencies: 333
-- Name: FUNCTION pg_replication_origin_session_progress(boolean); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_session_progress(boolean) TO azure_pg_admin;


--
-- TOC entry 4947 (class 0 OID 0)
-- Dependencies: 334
-- Name: FUNCTION pg_replication_origin_session_reset(); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_session_reset() TO azure_pg_admin;


--
-- TOC entry 4948 (class 0 OID 0)
-- Dependencies: 335
-- Name: FUNCTION pg_replication_origin_session_setup(text); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_session_setup(text) TO azure_pg_admin;


--
-- TOC entry 4949 (class 0 OID 0)
-- Dependencies: 338
-- Name: FUNCTION pg_replication_origin_xact_reset(); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_xact_reset() TO azure_pg_admin;


--
-- TOC entry 4950 (class 0 OID 0)
-- Dependencies: 336
-- Name: FUNCTION pg_replication_origin_xact_setup(pg_lsn, timestamp with time zone); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_xact_setup(pg_lsn, timestamp with time zone) TO azure_pg_admin;


--
-- TOC entry 4951 (class 0 OID 0)
-- Dependencies: 337
-- Name: FUNCTION pg_show_replication_origin_status(OUT local_id oid, OUT external_id text, OUT remote_lsn pg_lsn, OUT local_lsn pg_lsn); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_show_replication_origin_status(OUT local_id oid, OUT external_id text, OUT remote_lsn pg_lsn, OUT local_lsn pg_lsn) TO azure_pg_admin;


--
-- TOC entry 4952 (class 0 OID 0)
-- Dependencies: 325
-- Name: FUNCTION pg_stat_reset(); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_stat_reset() TO azure_pg_admin;


--
-- TOC entry 4953 (class 0 OID 0)
-- Dependencies: 324
-- Name: FUNCTION pg_stat_reset_shared(target text); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_stat_reset_shared(target text) TO azure_pg_admin;


--
-- TOC entry 4954 (class 0 OID 0)
-- Dependencies: 327
-- Name: FUNCTION pg_stat_reset_single_function_counters(oid); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_stat_reset_single_function_counters(oid) TO azure_pg_admin;


--
-- TOC entry 4955 (class 0 OID 0)
-- Dependencies: 326
-- Name: FUNCTION pg_stat_reset_single_table_counters(oid); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_stat_reset_single_table_counters(oid) TO azure_pg_admin;


--
-- TOC entry 4958 (class 0 OID 0)
-- Dependencies: 102
-- Name: COLUMN pg_config.name; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(name) ON TABLE pg_catalog.pg_config TO azure_pg_admin;


--
-- TOC entry 4959 (class 0 OID 0)
-- Dependencies: 102
-- Name: COLUMN pg_config.setting; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(setting) ON TABLE pg_catalog.pg_config TO azure_pg_admin;


--
-- TOC entry 4960 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.line_number; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(line_number) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4961 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.type; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(type) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4962 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.database; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(database) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4963 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.user_name; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(user_name) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4964 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.address; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(address) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4965 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.netmask; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(netmask) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4966 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.auth_method; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(auth_method) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4967 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.options; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(options) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4968 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.error; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(error) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4969 (class 0 OID 0)
-- Dependencies: 149
-- Name: COLUMN pg_replication_origin_status.local_id; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(local_id) ON TABLE pg_catalog.pg_replication_origin_status TO azure_pg_admin;


--
-- TOC entry 4970 (class 0 OID 0)
-- Dependencies: 149
-- Name: COLUMN pg_replication_origin_status.external_id; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(external_id) ON TABLE pg_catalog.pg_replication_origin_status TO azure_pg_admin;


--
-- TOC entry 4971 (class 0 OID 0)
-- Dependencies: 149
-- Name: COLUMN pg_replication_origin_status.remote_lsn; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(remote_lsn) ON TABLE pg_catalog.pg_replication_origin_status TO azure_pg_admin;


--
-- TOC entry 4972 (class 0 OID 0)
-- Dependencies: 149
-- Name: COLUMN pg_replication_origin_status.local_lsn; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(local_lsn) ON TABLE pg_catalog.pg_replication_origin_status TO azure_pg_admin;


--
-- TOC entry 4973 (class 0 OID 0)
-- Dependencies: 103
-- Name: COLUMN pg_shmem_allocations.name; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(name) ON TABLE pg_catalog.pg_shmem_allocations TO azure_pg_admin;


--
-- TOC entry 4974 (class 0 OID 0)
-- Dependencies: 103
-- Name: COLUMN pg_shmem_allocations.off; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(off) ON TABLE pg_catalog.pg_shmem_allocations TO azure_pg_admin;


--
-- TOC entry 4975 (class 0 OID 0)
-- Dependencies: 103
-- Name: COLUMN pg_shmem_allocations.size; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(size) ON TABLE pg_catalog.pg_shmem_allocations TO azure_pg_admin;


--
-- TOC entry 4976 (class 0 OID 0)
-- Dependencies: 103
-- Name: COLUMN pg_shmem_allocations.allocated_size; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(allocated_size) ON TABLE pg_catalog.pg_shmem_allocations TO azure_pg_admin;


--
-- TOC entry 4977 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.starelid; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(starelid) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4978 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.staattnum; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(staattnum) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4979 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stainherit; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stainherit) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4980 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stanullfrac; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stanullfrac) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4981 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stawidth; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stawidth) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4982 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stadistinct; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stadistinct) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4983 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stakind1; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stakind1) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4984 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stakind2; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stakind2) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4985 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stakind3; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stakind3) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4986 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stakind4; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stakind4) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4987 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stakind5; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stakind5) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4988 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.staop1; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(staop1) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4989 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.staop2; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(staop2) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4990 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.staop3; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(staop3) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4991 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.staop4; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(staop4) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4992 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.staop5; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(staop5) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4993 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stacoll1; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stacoll1) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4994 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stacoll2; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stacoll2) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4995 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stacoll3; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stacoll3) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4996 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stacoll4; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stacoll4) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4997 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stacoll5; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stacoll5) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4998 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stanumbers1; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stanumbers1) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4999 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stanumbers2; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stanumbers2) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 5000 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stanumbers3; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stanumbers3) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 5001 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stanumbers4; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stanumbers4) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 5002 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stanumbers5; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stanumbers5) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 5003 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stavalues1; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stavalues1) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 5004 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stavalues2; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stavalues2) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 5005 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stavalues3; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stavalues3) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 5006 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stavalues4; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stavalues4) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 5007 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stavalues5; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stavalues5) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 5008 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.oid; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(oid) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 5009 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subdbid; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subdbid) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 5010 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subname; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subname) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 5011 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subowner; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subowner) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 5012 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subenabled; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subenabled) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 5013 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subconninfo; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subconninfo) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 5014 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subslotname; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subslotname) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 5015 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subsynccommit; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subsynccommit) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 5016 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subpublications; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subpublications) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


-- Completed on 2026-01-07 20:43:15

--
-- PostgreSQL database dump complete
--

