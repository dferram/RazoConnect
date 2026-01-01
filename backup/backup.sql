--
-- PostgreSQL database dump
--

-- Dumped from database version 17.7
-- Dumped by pg_dump version 17.5

-- Started on 2025-12-31 14:33:39

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
-- TOC entry 4852 (class 0 OID 0)
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
-- TOC entry 4854 (class 0 OID 0)
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
-- TOC entry 4855 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION pgaadauth; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgaadauth IS 'Microsoft Entra ID Authentication';


--
-- TOC entry 974 (class 1247 OID 24963)
-- Name: estado_solicitud_enum; Type: TYPE; Schema: public; Owner: ferram
--

CREATE TYPE public.estado_solicitud_enum AS ENUM (
    'PENDIENTE',
    'APROBADO',
    'RECHAZADO'
);


ALTER TYPE public.estado_solicitud_enum OWNER TO ferram;

--
-- TOC entry 977 (class 1247 OID 24970)
-- Name: estatus_aplicacion_enum; Type: TYPE; Schema: public; Owner: ferram
--

CREATE TYPE public.estatus_aplicacion_enum AS ENUM (
    'PENDIENTE',
    'APLICADO',
    'NO_APLICADO'
);


ALTER TYPE public.estatus_aplicacion_enum OWNER TO ferram;

--
-- TOC entry 980 (class 1247 OID 24978)
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
-- TOC entry 983 (class 1247 OID 24988)
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
-- TOC entry 986 (class 1247 OID 25000)
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
-- TOC entry 989 (class 1247 OID 25010)
-- Name: tipo_cambio_enum; Type: TYPE; Schema: public; Owner: ferram
--

CREATE TYPE public.tipo_cambio_enum AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE'
);


ALTER TYPE public.tipo_cambio_enum OWNER TO ferram;

--
-- TOC entry 348 (class 1255 OID 25017)
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
-- TOC entry 349 (class 1255 OID 25018)
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
-- TOC entry 350 (class 1255 OID 25019)
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
-- TOC entry 351 (class 1255 OID 25020)
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
-- TOC entry 352 (class 1255 OID 25021)
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
-- TOC entry 4938 (class 0 OID 0)
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
-- TOC entry 4939 (class 0 OID 0)
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
-- TOC entry 4940 (class 0 OID 0)
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
-- TOC entry 4941 (class 0 OID 0)
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
-- TOC entry 4942 (class 0 OID 0)
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
    activo boolean DEFAULT true
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
-- TOC entry 4943 (class 0 OID 0)
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
-- TOC entry 4944 (class 0 OID 0)
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
-- TOC entry 4945 (class 0 OID 0)
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
    email character varying(255) NOT NULL,
    passwordhash character varying(255),
    telefono character varying(20),
    fechaderegistro timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    activo boolean DEFAULT true NOT NULL,
    agenteid integer,
    google_id character varying(255),
    avatar_url text
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
-- TOC entry 4946 (class 0 OID 0)
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
-- TOC entry 4947 (class 0 OID 0)
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
-- TOC entry 4948 (class 0 OID 0)
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
-- TOC entry 4949 (class 0 OID 0)
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
-- TOC entry 4950 (class 0 OID 0)
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
-- TOC entry 4951 (class 0 OID 0)
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
-- TOC entry 4952 (class 0 OID 0)
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
-- TOC entry 4953 (class 0 OID 0)
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
-- TOC entry 4954 (class 0 OID 0)
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
-- TOC entry 4955 (class 0 OID 0)
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
-- TOC entry 4956 (class 0 OID 0)
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
-- TOC entry 4957 (class 0 OID 0)
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
-- TOC entry 4958 (class 0 OID 0)
-- Dependencies: 262
-- Name: detallesordencompra_detalleoc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.detallesordencompra_detalleoc_id_seq OWNED BY public.detallesordencompra.detalleoc_id;


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
-- TOC entry 4959 (class 0 OID 0)
-- Dependencies: 263
-- Name: TABLE notificaciones; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.notificaciones IS 'Notificaciones para clientes del sistema';


--
-- TOC entry 4960 (class 0 OID 0)
-- Dependencies: 263
-- Name: COLUMN notificaciones.tipo; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.notificaciones.tipo IS 'Tipo de notificación: pedido, oferta, temporada, backorder, sistema, producto';


--
-- TOC entry 4961 (class 0 OID 0)
-- Dependencies: 263
-- Name: COLUMN notificaciones.metadata; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.notificaciones.metadata IS 'Información adicional en formato JSON (ej: pedidoId, productoId, etc)';


--
-- TOC entry 4962 (class 0 OID 0)
-- Dependencies: 263
-- Name: COLUMN notificaciones.url; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.notificaciones.url IS 'URL de redirección al hacer click en la notificación';


--
-- TOC entry 4963 (class 0 OID 0)
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
-- TOC entry 4964 (class 0 OID 0)
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
-- TOC entry 4965 (class 0 OID 0)
-- Dependencies: 266
-- Name: estados_estadoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.estados_estadoid_seq OWNED BY public.estados.estadoid;


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
-- TOC entry 4966 (class 0 OID 0)
-- Dependencies: 268
-- Name: itemsdelcarrito_itemid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.itemsdelcarrito_itemid_seq OWNED BY public.itemsdelcarrito.itemid;


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
-- TOC entry 4967 (class 0 OID 0)
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
-- TOC entry 4968 (class 0 OID 0)
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
-- TOC entry 4969 (class 0 OID 0)
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
-- TOC entry 4970 (class 0 OID 0)
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
-- TOC entry 4971 (class 0 OID 0)
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
-- TOC entry 4972 (class 0 OID 0)
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
-- TOC entry 4973 (class 0 OID 0)
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
-- TOC entry 4974 (class 0 OID 0)
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
-- TOC entry 4975 (class 0 OID 0)
-- Dependencies: 280
-- Name: TABLE pagos_clientes; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.pagos_clientes IS 'Registro de pagos realizados por clientes para liquidar su crédito';


--
-- TOC entry 4976 (class 0 OID 0)
-- Dependencies: 280
-- Name: COLUMN pagos_clientes.tipo_pago; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.pagos_clientes.tipo_pago IS 'Método de pago utilizado por el cliente';


--
-- TOC entry 4977 (class 0 OID 0)
-- Dependencies: 280
-- Name: COLUMN pagos_clientes.estatus; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.pagos_clientes.estatus IS 'PENDIENTE: En revisión | APROBADO: Validado y aplicado | RECHAZADO: No válido';


--
-- TOC entry 4978 (class 0 OID 0)
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
-- TOC entry 4979 (class 0 OID 0)
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
-- TOC entry 4980 (class 0 OID 0)
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
-- TOC entry 4981 (class 0 OID 0)
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
    monto_descuento numeric(10,2) DEFAULT 0.00
);


ALTER TABLE public.pedidos OWNER TO ferram;

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
-- TOC entry 4982 (class 0 OID 0)
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
-- TOC entry 4983 (class 0 OID 0)
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
-- TOC entry 4984 (class 0 OID 0)
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
-- TOC entry 4985 (class 0 OID 0)
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
-- TOC entry 4986 (class 0 OID 0)
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
-- TOC entry 4987 (class 0 OID 0)
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
    reglaid integer
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
-- TOC entry 4988 (class 0 OID 0)
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
-- TOC entry 4989 (class 0 OID 0)
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
-- TOC entry 4990 (class 0 OID 0)
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
-- TOC entry 4991 (class 0 OID 0)
-- Dependencies: 302
-- Name: solicitudes_credito_solicitud_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.solicitudes_credito_solicitud_id_seq OWNED BY public.solicitudes_credito.solicitud_id;


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
-- TOC entry 4992 (class 0 OID 0)
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
-- TOC entry 4993 (class 0 OID 0)
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
-- TOC entry 4994 (class 0 OID 0)
-- Dependencies: 305
-- Name: TABLE toma_inventario_conteos; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.toma_inventario_conteos IS 'Registros individuales de conteo doble ciego. Requiere coincidencia de A y B para validar.';


--
-- TOC entry 4995 (class 0 OID 0)
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
-- TOC entry 4996 (class 0 OID 0)
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
-- TOC entry 4997 (class 0 OID 0)
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
-- TOC entry 4998 (class 0 OID 0)
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
-- TOC entry 4217 (class 2604 OID 25345)
-- Name: administradores adminid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.administradores ALTER COLUMN adminid SET DEFAULT nextval('public.administradores_adminid_seq'::regclass);


--
-- TOC entry 4221 (class 2604 OID 25346)
-- Name: agentesdeventas agenteid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.agentesdeventas ALTER COLUMN agenteid SET DEFAULT nextval('public.agentesdeventas_agenteid_seq'::regclass);


--
-- TOC entry 4224 (class 2604 OID 25347)
-- Name: carritodecompra carritoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.carritodecompra ALTER COLUMN carritoid SET DEFAULT nextval('public.carritodecompra_carritoid_seq'::regclass);


--
-- TOC entry 4226 (class 2604 OID 25348)
-- Name: cat_cxp_etiquetas etiqueta_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_cxp_etiquetas ALTER COLUMN etiqueta_id SET DEFAULT nextval('public.cat_cxp_etiquetas_etiqueta_id_seq'::regclass);


--
-- TOC entry 4229 (class 2604 OID 25349)
-- Name: cat_tamanopaquetes tamanoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_tamanopaquetes ALTER COLUMN tamanoid SET DEFAULT nextval('public.cat_tamanopaquetes_tamanoid_seq'::regclass);


--
-- TOC entry 4230 (class 2604 OID 25350)
-- Name: categorias categoriaid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.categorias ALTER COLUMN categoriaid SET DEFAULT nextval('public.categorias_categoriaid_seq'::regclass);


--
-- TOC entry 4232 (class 2604 OID 25351)
-- Name: cliente_creditos credito_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_creditos ALTER COLUMN credito_id SET DEFAULT nextval('public.cliente_creditos_credito_id_seq'::regclass);


--
-- TOC entry 4240 (class 2604 OID 25352)
-- Name: cliente_direcciones direccionid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_direcciones ALTER COLUMN direccionid SET DEFAULT nextval('public.cliente_direcciones_direccionid_seq'::regclass);


--
-- TOC entry 4241 (class 2604 OID 25353)
-- Name: clientes clienteid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.clientes ALTER COLUMN clienteid SET DEFAULT nextval('public.clientes_clienteid_seq'::regclass);


--
-- TOC entry 4244 (class 2604 OID 25354)
-- Name: comisiones comisionid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.comisiones ALTER COLUMN comisionid SET DEFAULT nextval('public.comisiones_comisionid_seq'::regclass);


--
-- TOC entry 4247 (class 2604 OID 25355)
-- Name: communicationlogs logid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs ALTER COLUMN logid SET DEFAULT nextval('public.communicationlogs_logid_seq'::regclass);


--
-- TOC entry 4249 (class 2604 OID 25356)
-- Name: control_cambios id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.control_cambios ALTER COLUMN id SET DEFAULT nextval('public.control_cambios_id_seq'::regclass);


--
-- TOC entry 4252 (class 2604 OID 25357)
-- Name: credito_movimientos movimiento_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.credito_movimientos ALTER COLUMN movimiento_id SET DEFAULT nextval('public.credito_movimientos_movimiento_id_seq'::regclass);


--
-- TOC entry 4254 (class 2604 OID 25358)
-- Name: cuentas_por_cobrar cxcid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_cobrar ALTER COLUMN cxcid SET DEFAULT nextval('public.cuentas_por_cobrar_cxcid_seq'::regclass);


--
-- TOC entry 4256 (class 2604 OID 25359)
-- Name: cuentas_por_pagar cxp_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_pagar ALTER COLUMN cxp_id SET DEFAULT nextval('public.cuentas_por_pagar_cxp_id_seq'::regclass);


--
-- TOC entry 4346 (class 2604 OID 25896)
-- Name: cupones cuponid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cupones ALTER COLUMN cuponid SET DEFAULT nextval('public.cupones_cuponid_seq'::regclass);


--
-- TOC entry 4261 (class 2604 OID 25360)
-- Name: cxp_etiquetas_asignadas asignacion_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cxp_etiquetas_asignadas ALTER COLUMN asignacion_id SET DEFAULT nextval('public.cxp_etiquetas_asignadas_asignacion_id_seq'::regclass);


--
-- TOC entry 4263 (class 2604 OID 25361)
-- Name: datos_bancarios_empresa id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.datos_bancarios_empresa ALTER COLUMN id SET DEFAULT nextval('public.datos_bancarios_empresa_id_seq'::regclass);


--
-- TOC entry 4266 (class 2604 OID 25362)
-- Name: detallesdelpedido detalleid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesdelpedido ALTER COLUMN detalleid SET DEFAULT nextval('public.detallesdelpedido_detalleid_seq'::regclass);


--
-- TOC entry 4270 (class 2604 OID 25363)
-- Name: detallesordencompra detalleoc_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra ALTER COLUMN detalleoc_id SET DEFAULT nextval('public.detallesordencompra_detalleoc_id_seq'::regclass);


--
-- TOC entry 4280 (class 2604 OID 25364)
-- Name: estados estadoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados ALTER COLUMN estadoid SET DEFAULT nextval('public.estados_estadoid_seq'::regclass);


--
-- TOC entry 4281 (class 2604 OID 25365)
-- Name: itemsdelcarrito itemid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.itemsdelcarrito ALTER COLUMN itemid SET DEFAULT nextval('public.itemsdelcarrito_itemid_seq'::regclass);


--
-- TOC entry 4282 (class 2604 OID 25366)
-- Name: log_eventosusuario eventoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario ALTER COLUMN eventoid SET DEFAULT nextval('public.log_eventosusuario_eventoid_seq'::regclass);


--
-- TOC entry 4284 (class 2604 OID 25367)
-- Name: log_inventario logid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_inventario ALTER COLUMN logid SET DEFAULT nextval('public.log_inventario_logid_seq'::regclass);


--
-- TOC entry 4287 (class 2604 OID 25368)
-- Name: log_movimientos logid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_movimientos ALTER COLUMN logid SET DEFAULT nextval('public.log_movimientos_logid_seq'::regclass);


--
-- TOC entry 4289 (class 2604 OID 25369)
-- Name: medidas medidaid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas ALTER COLUMN medidaid SET DEFAULT nextval('public.medidas_medidaid_seq'::regclass);


--
-- TOC entry 4275 (class 2604 OID 25370)
-- Name: notificaciones notificacionid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones ALTER COLUMN notificacionid SET DEFAULT nextval('public.notificaciones_notificacionid_seq'::regclass);


--
-- TOC entry 4294 (class 2604 OID 25371)
-- Name: ordenesdecompra ordencompraid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.ordenesdecompra ALTER COLUMN ordencompraid SET DEFAULT nextval('public.ordenesdecompra_ordencompraid_seq'::regclass);


--
-- TOC entry 4301 (class 2604 OID 25372)
-- Name: pagos_clientes pago_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_clientes ALTER COLUMN pago_id SET DEFAULT nextval('public.pagos_clientes_pago_id_seq'::regclass);


--
-- TOC entry 4305 (class 2604 OID 25373)
-- Name: pagos_cxp pago_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_cxp ALTER COLUMN pago_id SET DEFAULT nextval('public.pagos_cxp_pago_id_seq'::regclass);


--
-- TOC entry 4307 (class 2604 OID 25374)
-- Name: passwordresettokens tokenid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens ALTER COLUMN tokenid SET DEFAULT nextval('public.passwordresettokens_tokenid_seq'::regclass);


--
-- TOC entry 4308 (class 2604 OID 25375)
-- Name: pedidos pedidoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pedidos ALTER COLUMN pedidoid SET DEFAULT nextval('public.pedidos_pedidoid_seq'::regclass);


--
-- TOC entry 4315 (class 2604 OID 25376)
-- Name: producto_imagenes imagenid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_imagenes ALTER COLUMN imagenid SET DEFAULT nextval('public.producto_imagenes_imagenid_seq'::regclass);


--
-- TOC entry 4344 (class 2604 OID 25880)
-- Name: producto_imagenes_color imagencolorid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_imagenes_color ALTER COLUMN imagencolorid SET DEFAULT nextval('public.producto_imagenes_color_imagencolorid_seq'::regclass);


--
-- TOC entry 4317 (class 2604 OID 25377)
-- Name: producto_variante_imagenes imagenid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variante_imagenes ALTER COLUMN imagenid SET DEFAULT nextval('public.producto_variante_imagenes_imagenid_seq'::regclass);


--
-- TOC entry 4319 (class 2604 OID 25378)
-- Name: producto_variantes varianteid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variantes ALTER COLUMN varianteid SET DEFAULT nextval('public.producto_variantes_varianteid_seq'::regclass);


--
-- TOC entry 4327 (class 2604 OID 25379)
-- Name: productos productoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos ALTER COLUMN productoid SET DEFAULT nextval('public.productos_productoid_seq1'::regclass);


--
-- TOC entry 4329 (class 2604 OID 25380)
-- Name: proveedor_reglas_empaque reglaid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedor_reglas_empaque ALTER COLUMN reglaid SET DEFAULT nextval('public.proveedor_reglas_empaque_reglaid_seq'::regclass);


--
-- TOC entry 4331 (class 2604 OID 25381)
-- Name: proveedores proveedorid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedores ALTER COLUMN proveedorid SET DEFAULT nextval('public.proveedores_proveedorid_seq'::regclass);


--
-- TOC entry 4332 (class 2604 OID 25382)
-- Name: solicitudes_credito solicitud_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.solicitudes_credito ALTER COLUMN solicitud_id SET DEFAULT nextval('public.solicitudes_credito_solicitud_id_seq'::regclass);


--
-- TOC entry 4335 (class 2604 OID 25383)
-- Name: tipoproducto tipoproductoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.tipoproducto ALTER COLUMN tipoproductoid SET DEFAULT nextval('public.tipoproducto_tipoproductoid_seq'::regclass);


--
-- TOC entry 4338 (class 2604 OID 25384)
-- Name: toma_inventario_conteos conteoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_conteos ALTER COLUMN conteoid SET DEFAULT nextval('public.toma_inventario_conteos_conteoid_seq'::regclass);


--
-- TOC entry 4341 (class 2604 OID 25385)
-- Name: toma_inventario_sesiones sesionid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_sesiones ALTER COLUMN sesionid SET DEFAULT nextval('public.toma_inventario_sesiones_sesionid_seq'::regclass);


--
-- TOC entry 4206 (class 0 OID 24745)
-- Dependencies: 222
-- Data for Name: job; Type: TABLE DATA; Schema: cron; Owner: azuresu
--



--
-- TOC entry 4208 (class 0 OID 24764)
-- Dependencies: 224
-- Data for Name: job_run_details; Type: TABLE DATA; Schema: cron; Owner: azuresu
--



--
-- TOC entry 4760 (class 0 OID 25022)
-- Dependencies: 225
-- Data for Name: administradores; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.administradores (adminid, nombre, email, passwordhash, rol, activo, fechacreacion, apellido, banco, numero_cuenta, clabe, titular) VALUES (2, 'Fernando', 'fegarcia@hotmail.com', '$2b$10$qDMIe7cygYpnw13f67vMn.wxKqlrUV32fWdyXsUoRKDRw1XmrN/ma', 'superadmin', true, '2025-11-06 12:09:59.605448', 'Garcia                                                                                              ', 'BBVA', '12321323123', '123123123123123123', 'Prueba 1');


--
-- TOC entry 4762 (class 0 OID 25031)
-- Dependencies: 227
-- Data for Name: agentesdeventas; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.agentesdeventas (agenteid, nombre, apellido, email, passwordhash, codigoagente, activo, esadmin, adminrol, banco, numero_cuenta, clabe, titular) VALUES (1, 'Lupita', 'García', 'pupis_gr@hotmail.com', '$2b$10$6t8maMlHk52sLRQ4PSGnJe0y/6gbIlEQYtlNgba/HwV1LzArkqfie', 'AG0001', true, false, NULL, NULL, NULL, NULL, NULL);


--
-- TOC entry 4764 (class 0 OID 25039)
-- Dependencies: 229
-- Data for Name: carritodecompra; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.carritodecompra (carritoid, clienteid, fechacreacion, ultimamodificacion) VALUES (1, 1, '2025-12-19 17:46:56.916237', '2025-12-26 17:08:47.679796');
INSERT INTO public.carritodecompra (carritoid, clienteid, fechacreacion, ultimamodificacion) VALUES (3, 3, '2025-12-30 18:25:47.523072', '2025-12-30 18:26:04.308132');
INSERT INTO public.carritodecompra (carritoid, clienteid, fechacreacion, ultimamodificacion) VALUES (2, 2, '2025-12-21 23:06:38.490057', '2025-12-31 13:11:59.894676');


--
-- TOC entry 4766 (class 0 OID 25044)
-- Dependencies: 231
-- Data for Name: cat_cxp_etiquetas; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 4768 (class 0 OID 25050)
-- Dependencies: 233
-- Data for Name: cat_tamanopaquetes; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.cat_tamanopaquetes (tamanoid, cantidad) VALUES (1, 1);
INSERT INTO public.cat_tamanopaquetes (tamanoid, cantidad) VALUES (2, 3);
INSERT INTO public.cat_tamanopaquetes (tamanoid, cantidad) VALUES (3, 6);
INSERT INTO public.cat_tamanopaquetes (tamanoid, cantidad) VALUES (4, 12);
INSERT INTO public.cat_tamanopaquetes (tamanoid, cantidad) VALUES (5, 4);


--
-- TOC entry 4770 (class 0 OID 25054)
-- Dependencies: 235
-- Data for Name: categorias; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.categorias (categoriaid, nombre, descripcion, parentcategoriaid, activo) VALUES (1, 'Lisas', 'Cajas perfectas para cualquier época del año!', NULL, true);
INSERT INTO public.categorias (categoriaid, nombre, descripcion, parentcategoriaid, activo) VALUES (2, 'Amor', NULL, NULL, true);
INSERT INTO public.categorias (categoriaid, nombre, descripcion, parentcategoriaid, activo) VALUES (3, 'Toda Ocasión', NULL, NULL, true);
INSERT INTO public.categorias (categoriaid, nombre, descripcion, parentcategoriaid, activo) VALUES (4, 'Natural', NULL, NULL, true);


--
-- TOC entry 4772 (class 0 OID 25061)
-- Dependencies: 237
-- Data for Name: cliente_creditos; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.cliente_creditos (credito_id, cliente_id, limite_credito, saldo_deudor, dias_gracia, estado_credito, fecha_creacion, ultima_actualizacion, exportado_en, reporte_id) VALUES (2, 1, 20000.00, 0.00, 15, 'ACTIVO', '2025-12-26 16:59:35.424281', '2025-12-29 02:26:47.864091', NULL, NULL);
INSERT INTO public.cliente_creditos (credito_id, cliente_id, limite_credito, saldo_deudor, dias_gracia, estado_credito, fecha_creacion, ultima_actualizacion, exportado_en, reporte_id) VALUES (1, 2, 5000.00, 0.00, 15, 'ACTIVO', '2025-12-25 01:42:28.676782', '2025-12-29 02:34:59.970783', '2025-12-25 05:49:15.580167', 'CxC-20251225-054915');


--
-- TOC entry 4774 (class 0 OID 25074)
-- Dependencies: 239
-- Data for Name: cliente_direcciones; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.cliente_direcciones (direccionid, clienteid, etiqueta, receptor, calle, numeroext, numeroint, colonia, ciudad, codigopostal, telefonocontacto, estadoid) VALUES (1, 2, 'Casa', 'Fernando Ramírez', 'Paso de los Toros', '1821', '28', 'El Refugio', 'Querétaro', '76146', '5560989524', 22);
INSERT INTO public.cliente_direcciones (direccionid, clienteid, etiqueta, receptor, calle, numeroext, numeroint, colonia, ciudad, codigopostal, telefonocontacto, estadoid) VALUES (2, 1, 'Casa', 'Fernando Ramírez', 'Paso de los Toros', '1821', '28', 'El Refugio', 'Querétaro', '76146', '5560989524', 22);


--
-- TOC entry 4776 (class 0 OID 25080)
-- Dependencies: 241
-- Data for Name: clientes; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.clientes (clienteid, nombre, apellido, email, passwordhash, telefono, fechaderegistro, activo, agenteid, google_id, avatar_url) VALUES (1, 'Diego Fernando', 'Ramírez García', 'dferram8@gmail.com', NULL, NULL, '2025-12-19 12:11:47.325519', true, NULL, '112463414682839499861', 'https://lh3.googleusercontent.com/a/ACg8ocL4vAqVyYj3GucQspTlE6BtmuyoqZqML7L4Zcb7WdwdcHT9m4E=s96-c');
INSERT INTO public.clientes (clienteid, nombre, apellido, email, passwordhash, telefono, fechaderegistro, activo, agenteid, google_id, avatar_url) VALUES (2, 'Diego Fernando', 'Ramírez García', 'dferramm@gmail.com', '$2b$10$wO8AHmwoDDh3LXVCnr4vQOsk6kvSQFc8We7oWdDKigyPseuvo6tc2', '5560989524', '2025-01-21 13:06:50.921092', true, NULL, '107035380971984210505', 'https://lh3.googleusercontent.com/a/ACg8ocKNxihdAINOrco8B52uUBljbYq3DjLlFlU9VsDVdeuo9DZ5IQ=s96-c');
INSERT INTO public.clientes (clienteid, nombre, apellido, email, passwordhash, telefono, fechaderegistro, activo, agenteid, google_id, avatar_url) VALUES (3, 'Lupita', 'García', 'pupis_gr@icloud.com', '$2b$10$pUi0TSxAs1M2rafjeqwazujlHbNJfXZGBweVQlBBqN6QeQ08/RrfS', '4271238646', '2025-12-30 18:21:12.4994', true, NULL, NULL, NULL);


--
-- TOC entry 4778 (class 0 OID 25088)
-- Dependencies: 243
-- Data for Name: comisiones; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 4780 (class 0 OID 25094)
-- Dependencies: 245
-- Data for Name: communicationlogs; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (3, '2025-12-25 04:39:46.564496', 'dferram8@gmail.com', '💰 Nuevo Pedido #1 - $171.60', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (1, '2025-12-25 04:39:46.562214', 'dferramm@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#1)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (2, '2025-12-25 04:39:46.562757', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #1', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (4, '2025-12-25 04:48:41.766412', 'dferramm@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#2)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (5, '2025-12-25 04:48:41.7668', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #2', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (6, '2025-12-25 04:48:41.782046', 'dferram8@gmail.com', '💰 Nuevo Pedido #2 - $634.80', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (7, '2025-12-25 05:32:51.176362', 'dferram8@gmail.com', '💰 Nuevo Pedido #3 - $1544.40', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (8, '2025-12-25 05:32:51.179396', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #3', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (9, '2025-12-25 05:32:51.199213', 'dferramm@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#3)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (10, '2025-12-25 11:25:08.29327', 'dferram8@gmail.com', '💰 Nuevo Pedido #4 - $343.20', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (11, '2025-12-25 11:25:08.314891', 'dferramm@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#4)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (12, '2025-12-25 11:25:08.315472', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #4', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (13, '2025-12-25 12:16:07.393122', 'dferram8@gmail.com', '💰 Nuevo Pedido #5 - $686.40', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (14, '2025-12-25 12:16:07.394111', 'dferramm@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#5)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (15, '2025-12-25 12:16:07.399736', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #5', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (17, '2025-12-25 12:34:27.068359', 'dferramm@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#6)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (16, '2025-12-25 12:34:27.067251', 'dferram8@gmail.com', '💰 Nuevo Pedido #6 - $171.60', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (18, '2025-12-25 12:34:31.964969', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #6', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (19, '2025-12-26 17:10:54.237893', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #7', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (20, '2025-12-26 17:10:54.293842', 'dferram8@gmail.com', '💰 Nuevo Pedido #7 - $5994.00', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (22, '2025-12-26 17:10:54.295262', 'dferram8@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#7)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (21, '2025-12-26 17:10:54.294292', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: NAT-002-JUM', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (23, '2025-12-29 02:01:40.445924', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #8', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (24, '2025-12-29 02:01:40.657885', 'dferramm@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#8)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (25, '2025-12-29 02:01:40.67848', 'dferram8@gmail.com', '💰 Nuevo Pedido #8 - $896.40', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (26, '2025-12-29 02:31:05.578449', 'dferram8@gmail.com', '💰 Nuevo Pedido #9 - $1234.80', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (27, '2025-12-29 02:31:05.833855', 'dferramm@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#9)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (28, '2025-12-29 02:31:05.859533', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #9', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (29, '2025-12-29 02:31:42.057377', 'dferramm@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#10)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (30, '2025-12-29 02:31:42.478386', 'dferram8@gmail.com', '💰 Nuevo Pedido #10 - $1904.40', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (31, '2025-12-29 02:31:42.479077', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #10', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (32, '2025-12-29 02:32:19.141644', 'dferram8@gmail.com', '⚠️ Alerta: Backorder generado para el pedido #11', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (33, '2025-12-29 02:32:19.143006', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: AMO-006-25X25-NEGRO', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (34, '2025-12-29 02:32:19.15855', 'dferramm@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#11)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (35, '2025-12-29 02:32:19.172234', 'dferram8@gmail.com', '💰 Nuevo Pedido #11 - $955.20', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (36, '2025-12-29 02:33:11.367733', 'dferramm@gmail.com', 'Tu pedido RazoConnect ha sido recibido (#12)', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (37, '2025-12-29 02:33:11.373212', 'dferram8@gmail.com', '💰 Nuevo Pedido #12 - $634.80', 'Enviado', NULL, NULL, NULL, NULL);
INSERT INTO public.communicationlogs (logid, "timestamp", destinatario, asunto, estatusemail, errormensaje, pedidoid, clienteid, proveedorid) VALUES (38, '2025-12-29 02:33:11.432512', 'dferram8@gmail.com', '⚠️ Alerta de Stock Bajo: AMO-014', 'Enviado', NULL, NULL, NULL, NULL);


--
-- TOC entry 4782 (class 0 OID 25102)
-- Dependencies: 247
-- Data for Name: control_cambios; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (1, 'categorias', 2, 'INSERT', NULL, '{"activo": true, "nombre": "Amor", "categoriaid": 2, "descripcion": null, "parentcategoriaid": null}', 2, 'APROBADO', '2025-12-24 16:36:57.883671', '2025-12-24 16:36:57.883671', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (2, 'proveedores', 1, 'INSERT', NULL, '{"rfc": null, "banco": null, "calle": null, "clabe": null, "email": null, "ciudad": null, "estado": null, "colonia": null, "telefono": null, "diascredito": null, "emailventas": null, "proveedorid": 1, "razonsocial": null, "codigopostal": null, "minimocompra": null, "numerocuenta": null, "celularventas": null, "emailcobranza": null, "limitecredito": null, "nombreempresa": "Fashion", "regimenfiscal": null, "contactonombre": null, "referenciapago": null, "telefonocobranza": null, "aceptadevoluciones": false, "descuentofinanciero": null, "nombrecontactocobranza": null, "nombrerepresentanteventas": null}', 2, 'APROBADO', '2025-12-24 16:37:12.72206', '2025-12-24 16:37:12.72206', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (3, 'productos', 1, 'INSERT', NULL, '{"activo": true, "productoid": 1, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-CUBO", "nombreproducto": "Cubo Colors Love"}', 2, 'APROBADO', '2025-12-24 17:14:16.684696', '2025-12-24 17:14:16.684696', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (4, 'productos', 1, 'UPDATE', '{"activo": true, "productoid": 1, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-CUBO", "nombreproducto": "Cubo Colors Love", "tipoproductoid": null}', '{"activo": true, "productoid": 1, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-CUBO", "nombreproducto": "Colors Love Cubo", "tipoproductoid": null, "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-24 17:15:17.316257', '2025-12-24 17:15:17.316257', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (5, 'productos', 2, 'INSERT', NULL, '{"activo": true, "productoid": 2, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-LVOR", "nombreproducto": "LV Oro"}', 2, 'APROBADO', '2025-12-25 06:07:04.366391', '2025-12-25 06:07:04.366391', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (6, 'productos', 3, 'INSERT', NULL, '{"activo": true, "productoid": 3, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-BRIL", "nombreproducto": "Brillo"}', 2, 'APROBADO', '2025-12-25 06:10:40.960643', '2025-12-25 06:10:40.960643', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (7, 'productos', 4, 'INSERT', NULL, '{"activo": true, "productoid": 4, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-BLAC", "nombreproducto": "Black"}', 2, 'APROBADO', '2025-12-25 06:14:06.917618', '2025-12-25 06:14:06.917618', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (8, 'productos', 5, 'INSERT', NULL, '{"activo": true, "productoid": 5, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-CRAF", "nombreproducto": "Craft"}', 2, 'APROBADO', '2025-12-25 06:20:27.633495', '2025-12-25 06:20:27.633495', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (9, 'productos', 6, 'INSERT', NULL, '{"activo": true, "productoid": 6, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-COLO", "nombreproducto": "Colores"}', 2, 'APROBADO', '2025-12-25 06:23:13.818184', '2025-12-25 06:23:13.818184', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (10, 'productos', 7, 'INSERT', NULL, '{"activo": true, "productoid": 7, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-REDB", "nombreproducto": "RedBlack"}', 2, 'APROBADO', '2025-12-25 06:25:42.055698', '2025-12-25 06:25:42.055698', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (11, 'productos', 8, 'INSERT', NULL, '{"activo": true, "productoid": 8, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-HECH", "nombreproducto": "Hecho en México"}', 2, 'APROBADO', '2025-12-25 06:27:35.096206', '2025-12-25 06:27:35.096206', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (12, 'productos', 4, 'UPDATE', '{"activo": true, "reglaid": null, "productoid": 4, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-BLAC", "nombreproducto": "Black"}', '{"activo": true, "reglaid": 1, "productoid": 4, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-BLAC", "nombreproducto": "Black", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-25 11:28:36.979176', '2025-12-25 11:28:36.979176', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (13, 'productos', 4, 'UPDATE', '{"activo": true, "reglaid": 1, "productoid": 4, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-BLAC", "nombreproducto": "Black"}', '{"activo": true, "reglaid": 1, "productoid": 4, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-BLAC", "nombreproducto": "Black", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-25 11:29:47.971708', '2025-12-25 11:29:47.971708', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (14, 'productos', 3, 'UPDATE', '{"activo": true, "reglaid": null, "productoid": 3, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-BRIL", "nombreproducto": "Brillo"}', '{"activo": true, "reglaid": 1, "productoid": 3, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-BRIL", "nombreproducto": "Brillo", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-25 11:30:03.549911', '2025-12-25 11:30:03.549911', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (15, 'productos', 6, 'UPDATE', '{"activo": true, "reglaid": null, "productoid": 6, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-COLO", "nombreproducto": "Colores"}', '{"activo": true, "reglaid": null, "productoid": 6, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-COLO", "nombreproducto": "Colores", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-25 11:30:42.251757', '2025-12-25 11:30:42.251757', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (16, 'productos', 6, 'UPDATE', '{"activo": true, "reglaid": null, "productoid": 6, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-COLO", "nombreproducto": "Colores"}', '{"activo": true, "reglaid": 1, "productoid": 6, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-COLO", "nombreproducto": "Colores", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-25 11:31:04.688062', '2025-12-25 11:31:04.688062', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (17, 'productos', 1, 'UPDATE', '{"activo": true, "reglaid": null, "productoid": 1, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-CUBO", "nombreproducto": "Colors Love Cubo"}', '{"activo": true, "reglaid": 1, "productoid": 1, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-CUBO", "nombreproducto": "Colors Love Cubo", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-25 11:31:18.488298', '2025-12-25 11:31:18.488298', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (18, 'productos', 5, 'UPDATE', '{"activo": true, "reglaid": null, "productoid": 5, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-CRAF", "nombreproducto": "Craft"}', '{"activo": true, "reglaid": 1, "productoid": 5, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-CRAF", "nombreproducto": "Craft", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-25 11:31:44.889572', '2025-12-25 11:31:44.889572', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (19, 'productos', 8, 'UPDATE', '{"activo": true, "reglaid": null, "productoid": 8, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-HECH", "nombreproducto": "Hecho en México"}', '{"activo": true, "reglaid": 1, "productoid": 8, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-HECH", "nombreproducto": "Hecho en México", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-25 11:31:56.469369', '2025-12-25 11:31:56.469369', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (20, 'productos', 2, 'UPDATE', '{"activo": true, "reglaid": null, "productoid": 2, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-LVOR", "nombreproducto": "LV Oro"}', '{"activo": true, "reglaid": 1, "productoid": 2, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-LVOR", "nombreproducto": "LV Oro", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-25 11:32:11.928208', '2025-12-25 11:32:11.928208', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (21, 'productos', 7, 'UPDATE', '{"activo": true, "reglaid": null, "productoid": 7, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "25-FAS-CAJ-AMO-REDB", "nombreproducto": "RedBlack"}', '{"activo": true, "reglaid": 1, "productoid": 7, "categoriaid": 2, "descripcion": null, "sku_maestro": "25-FAS-CAJ-AMO-REDB", "nombreproducto": "RedBlack", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-25 11:32:25.472244', '2025-12-25 11:32:25.472244', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (22, 'pedidos', 4, 'UPDATE', '{"estatus": "Parcialmente Surtido", "pedidoid": 4}', '{"estatus": "Confirmado", "pedidoid": 4}', 2, 'APROBADO', '2025-12-25 12:03:24.101952', '2025-12-25 12:03:24.101952', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (23, 'pedidos', 4, 'UPDATE', '{"estatus": "Confirmado", "pedidoid": 4}', '{"estatus": "Enviado", "pedidoid": 4}', 2, 'APROBADO', '2025-12-25 12:03:36.153384', '2025-12-25 12:03:36.153384', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (24, 'pedidos', 4, 'UPDATE', '{"estatus": "Enviado", "pedidoid": 4}', '{"estatus": "Confirmado", "pedidoid": 4}', 2, 'APROBADO', '2025-12-25 12:04:12.9404', '2025-12-25 12:04:12.9404', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (25, 'pedidos', 4, 'UPDATE', '{"estatus": "Confirmado", "pedidoid": 4}', '{"estatus": "Entregado", "pedidoid": 4}', 2, 'APROBADO', '2025-12-25 12:05:20.262903', '2025-12-25 12:05:20.262903', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (26, 'pedidos', 6, 'UPDATE', '{"estatus": "Parcialmente Surtido", "pedidoid": 6}', '{"estatus": "Confirmado", "pedidoid": 6}', 2, 'APROBADO', '2025-12-25 12:35:08.770103', '2025-12-25 12:35:08.770103', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (27, 'proveedores', 3, 'INSERT', NULL, '{"rfc": null, "banco": null, "calle": null, "clabe": null, "email": null, "ciudad": null, "estado": null, "colonia": null, "telefono": null, "diascredito": null, "emailventas": null, "proveedorid": 3, "razonsocial": null, "codigopostal": null, "minimocompra": null, "numerocuenta": null, "celularventas": null, "emailcobranza": null, "limitecredito": null, "nombreempresa": "ExploWorld", "regimenfiscal": null, "contactonombre": null, "referenciapago": null, "telefonocobranza": null, "aceptadevoluciones": false, "descuentofinanciero": null, "nombrecontactocobranza": null, "nombrerepresentanteventas": null}', 2, 'APROBADO', '2025-12-26 13:40:58.939631', '2025-12-26 13:40:58.939631', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (28, 'categorias', 3, 'INSERT', NULL, '{"activo": true, "nombre": "Toda Ocasión", "categoriaid": 3, "descripcion": null, "parentcategoriaid": null}', 2, 'APROBADO', '2025-12-26 13:43:56.448044', '2025-12-26 13:43:56.448044', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (29, 'productos', 9, 'INSERT', NULL, '{"activo": true, "reglaid": 1, "productoid": 9, "categoriaid": 2, "descripcion": "Cubo Acetato", "proveedorid": 1, "sku_maestro": "AMO-018", "nombreproducto": "Cubo Acetato"}', 2, 'APROBADO', '2025-12-26 13:52:22.610319', '2025-12-26 13:52:22.610319', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (30, 'productos', 9, 'UPDATE', '{"activo": true, "reglaid": 1, "productoid": 9, "categoriaid": 2, "descripcion": "Cubo Acetato", "proveedorid": 1, "sku_maestro": "AMO-018", "nombreproducto": "Cubo Acetato"}', '{"activo": true, "reglaid": 1, "productoid": 9, "categoriaid": 2, "descripcion": "Cubo Acetato", "sku_maestro": "AMO-018", "nombreproducto": "Cubo Acetato", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-26 14:55:23.048718', '2025-12-26 14:55:23.048718', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (31, 'productos', 10, 'INSERT', NULL, '{"activo": true, "reglaid": 5, "productoid": 10, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-019", "nombreproducto": "Libreta"}', 2, 'APROBADO', '2025-12-26 15:04:45.274991', '2025-12-26 15:04:45.274991', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (32, 'productos', 11, 'INSERT', NULL, '{"activo": true, "reglaid": 2, "productoid": 11, "categoriaid": 1, "descripcion": null, "proveedorid": 1, "sku_maestro": "LIS-001", "nombreproducto": "Cubo Liso"}', 2, 'APROBADO', '2025-12-26 15:27:12.852081', '2025-12-26 15:27:12.852081', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (33, 'productos', 3, 'UPDATE', '{"activo": true, "reglaid": 1, "productoid": 3, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-006", "nombreproducto": "Brillo"}', '{"activo": true, "reglaid": 1, "productoid": 3, "categoriaid": 1, "descripcion": null, "sku_maestro": "AMO-006", "nombreproducto": "Brillo", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-26 15:31:45.71898', '2025-12-26 15:31:45.71898', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (34, 'categorias', 4, 'INSERT', NULL, '{"activo": true, "nombre": "Natural", "categoriaid": 4, "descripcion": null, "parentcategoriaid": null}', 2, 'APROBADO', '2025-12-26 15:33:03.471727', '2025-12-26 15:33:03.471727', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (35, 'productos', 12, 'INSERT', NULL, '{"activo": true, "reglaid": 2, "productoid": 12, "categoriaid": 4, "descripcion": null, "proveedorid": 1, "sku_maestro": "NAT-001", "nombreproducto": "Cubo Natural"}', 2, 'APROBADO', '2025-12-26 15:36:29.447567', '2025-12-26 15:36:29.447567', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (36, 'productos', 13, 'INSERT', NULL, '{"activo": true, "reglaid": 2, "productoid": 13, "categoriaid": 4, "descripcion": null, "proveedorid": 1, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural"}', 2, 'APROBADO', '2025-12-26 15:45:16.84568', '2025-12-26 15:45:16.84568', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (37, 'productos', 13, 'UPDATE', '{"activo": true, "reglaid": 2, "productoid": 13, "categoriaid": 4, "descripcion": null, "proveedorid": 1, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural"}', '{"activo": true, "reglaid": 2, "productoid": 13, "categoriaid": 4, "descripcion": null, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-26 16:30:15.027754', '2025-12-26 16:30:15.027754', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (38, 'productos', 13, 'UPDATE', '{"activo": true, "reglaid": 2, "productoid": 13, "categoriaid": 4, "descripcion": null, "proveedorid": 1, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural"}', '{"activo": true, "reglaid": 2, "productoid": 13, "categoriaid": 4, "descripcion": null, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-26 16:32:10.704473', '2025-12-26 16:32:10.704473', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (39, 'productos', 13, 'UPDATE', '{"activo": true, "reglaid": 2, "productoid": 13, "categoriaid": 4, "descripcion": null, "proveedorid": 1, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural"}', '{"activo": true, "reglaid": 1, "productoid": 13, "categoriaid": 4, "descripcion": null, "sku_maestro": "NAT-002", "nombreproducto": "Camisera Natural", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-26 16:38:02.654604', '2025-12-26 16:38:02.654604', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (40, 'productos', 10, 'UPDATE', '{"activo": true, "reglaid": 5, "productoid": 10, "categoriaid": 2, "descripcion": null, "proveedorid": 1, "sku_maestro": "AMO-019", "nombreproducto": "Libreta"}', '{"activo": true, "reglaid": 5, "productoid": 10, "categoriaid": 2, "descripcion": null, "sku_maestro": "AMO-019", "nombreproducto": "Libreta", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-31 08:52:28.749917', '2025-12-31 08:52:28.749917', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (41, 'productos', 14, 'INSERT', NULL, '{"activo": true, "reglaid": 2, "productoid": 14, "categoriaid": 1, "descripcion": null, "proveedorid": 1, "sku_maestro": "LIS-002", "nombreproducto": "Línea Metalizada"}', 2, 'APROBADO', '2025-12-31 08:56:50.280269', '2025-12-31 08:56:50.280269', 2);
INSERT INTO public.control_cambios (id, entidad, entidad_id, tipo_cambio, datos_anteriores, datos_nuevos, usuario_solicitante_id, estado, fecha_solicitud, fecha_resolucion, usuario_resolutor_id) VALUES (42, 'productos', 14, 'UPDATE', '{"activo": true, "reglaid": 2, "productoid": 14, "categoriaid": 1, "descripcion": null, "proveedorid": 1, "sku_maestro": "LIS-002", "nombreproducto": "Línea Metalizada"}', '{"activo": true, "reglaid": 1, "productoid": 14, "categoriaid": 1, "descripcion": null, "sku_maestro": "LIS-002", "nombreproducto": "Línea Metalizada", "proveedorid_default": 1}', 2, 'APROBADO', '2025-12-31 09:15:49.773776', '2025-12-31 09:15:49.773776', 2);


--
-- TOC entry 4784 (class 0 OID 25110)
-- Dependencies: 249
-- Data for Name: credito_movimientos; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.credito_movimientos (movimiento_id, credito_id, tipo_movimiento, monto, referencia_id, descripcion, fecha_movimiento, saldo_despues_movimiento, registrado_por, admin_id, agente_id) VALUES (13, 1, 'CARGO', 1234.80, 'PED-9', 'Compra realizada (Pedido #9)', '2025-12-29 02:31:02.579417', 1234.80, NULL, NULL, NULL);
INSERT INTO public.credito_movimientos (movimiento_id, credito_id, tipo_movimiento, monto, referencia_id, descripcion, fecha_movimiento, saldo_despues_movimiento, registrado_por, admin_id, agente_id) VALUES (14, 1, 'CARGO', 1904.40, 'PED-10', 'Compra realizada (Pedido #10)', '2025-12-29 02:31:35.046362', 3139.20, NULL, NULL, NULL);
INSERT INTO public.credito_movimientos (movimiento_id, credito_id, tipo_movimiento, monto, referencia_id, descripcion, fecha_movimiento, saldo_despues_movimiento, registrado_por, admin_id, agente_id) VALUES (15, 1, 'CARGO', 955.20, 'PED-11', 'Compra realizada (Pedido #11)', '2025-12-29 02:32:16.496963', 4094.40, NULL, NULL, NULL);
INSERT INTO public.credito_movimientos (movimiento_id, credito_id, tipo_movimiento, monto, referencia_id, descripcion, fecha_movimiento, saldo_despues_movimiento, registrado_por, admin_id, agente_id) VALUES (16, 1, 'CARGO', 634.80, 'PED-12', 'Compra realizada (Pedido #12)', '2025-12-29 02:33:04.229328', 4729.20, NULL, NULL, NULL);
INSERT INTO public.credito_movimientos (movimiento_id, credito_id, tipo_movimiento, monto, referencia_id, descripcion, fecha_movimiento, saldo_despues_movimiento, registrado_por, admin_id, agente_id) VALUES (17, 1, 'ABONO', 1234.80, 'PED-9', 'Pago validado por transferencia bancaria (Ref: Transferencia bancaria)', '2025-12-29 02:34:05.660581', 3494.40, 2, 2, NULL);
INSERT INTO public.credito_movimientos (movimiento_id, credito_id, tipo_movimiento, monto, referencia_id, descripcion, fecha_movimiento, saldo_despues_movimiento, registrado_por, admin_id, agente_id) VALUES (18, 1, 'ABONO', 4729.20, 'PED-10', 'Pago validado por transferencia bancaria (Ref: Transferencia bancaria)', '2025-12-29 02:34:59.970783', 0.00, 2, 2, NULL);


--
-- TOC entry 4786 (class 0 OID 25117)
-- Dependencies: 251
-- Data for Name: cuentas_por_cobrar; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 4788 (class 0 OID 25122)
-- Dependencies: 253
-- Data for Name: cuentas_por_pagar; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.cuentas_por_pagar (cxp_id, proveedor_id, orden_compra_id, fecha_emision, fecha_vencimiento, monto_total, monto_pagado, estatus, referencia_factura, comprobante_pago, notas, usuario_creador_id, monto_original, fecha_cierre, exportado_en, reporte_id) VALUES (3, 1, 3, '2025-12-25 20:03:12.735636', '2025-12-25', 0.00, 0.00, 'PENDIENTE', 'REM-101', NULL, NULL, 2, 0.00, NULL, NULL, NULL);
INSERT INTO public.cuentas_por_pagar (cxp_id, proveedor_id, orden_compra_id, fecha_emision, fecha_vencimiento, monto_total, monto_pagado, estatus, referencia_factura, comprobante_pago, notas, usuario_creador_id, monto_original, fecha_cierre, exportado_en, reporte_id) VALUES (2, 1, 4, '2025-12-25 20:02:51.311356', '2025-12-25', 586.32, 586.32, 'PAGADO', 'Transferencia', NULL, 'Transferencia', 2, 586.32, NULL, NULL, NULL);
INSERT INTO public.cuentas_por_pagar (cxp_id, proveedor_id, orden_compra_id, fecha_emision, fecha_vencimiento, monto_total, monto_pagado, estatus, referencia_factura, comprobante_pago, notas, usuario_creador_id, monto_original, fecha_cierre, exportado_en, reporte_id) VALUES (1, 1, 5, '2025-12-25 19:52:37.128419', '2025-12-25', 754.32, 754.32, 'PAGADO', 'Transferencia', NULL, 'Transferencia', 2, 754.32, NULL, NULL, NULL);
INSERT INTO public.cuentas_por_pagar (cxp_id, proveedor_id, orden_compra_id, fecha_emision, fecha_vencimiento, monto_total, monto_pagado, estatus, referencia_factura, comprobante_pago, notas, usuario_creador_id, monto_original, fecha_cierre, exportado_en, reporte_id) VALUES (4, 1, 8, '2025-12-26 16:45:46.612036', '2025-12-26', 5738.88, 0.00, 'PENDIENTE', 'REM-102', NULL, NULL, 2, 5738.88, NULL, NULL, NULL);


--
-- TOC entry 4846 (class 0 OID 25893)
-- Dependencies: 313
-- Data for Name: cupones; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 4790 (class 0 OID 25135)
-- Dependencies: 255
-- Data for Name: cxp_etiquetas_asignadas; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 4792 (class 0 OID 25140)
-- Dependencies: 257
-- Data for Name: datos_bancarios_empresa; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.datos_bancarios_empresa (id, banco, numero_cuenta, clabe, titular, ultima_actualizacion, es_principal) VALUES (2, 'PRUEBA', '21321321323112', '123132131231231232', 'Prueba 1', '2025-12-26 17:22:59.337362', false);
INSERT INTO public.datos_bancarios_empresa (id, banco, numero_cuenta, clabe, titular, ultima_actualizacion, es_principal) VALUES (1, 'Banco Default', '0000000000', '000000000000000000', 'RazoConnect S.A.', '2025-12-26 17:23:02.814789', true);


--
-- TOC entry 4794 (class 0 OID 25146)
-- Dependencies: 259
-- Data for Name: detallesdelpedido; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (1, 1, 1, 1, 171.60, 4, 42.90, 5, true, 0, 1);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (2, 2, 2, 1, 634.80, 12, 52.90, 4, true, 0, 1);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (3, 3, 1, 3, 514.80, 36, 42.90, 4, true, 0, 3);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (4, 4, 16, 2, 171.60, 8, 42.90, 5, true, 0, 2);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (5, 5, 16, 3, 171.60, 12, 42.90, 5, true, 0, 3);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (6, 5, 16, 1, 514.80, 12, 42.90, 4, true, 0, 1);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (7, 6, 16, 3, 171.60, 12, 42.90, 5, true, 0, 3);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (8, 7, 40, 2, 298.80, 24, 24.90, 4, false, 2, 0);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (9, 7, 32, 2, 202.80, 24, 16.90, 4, true, 0, 2);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (10, 7, 33, 2, 250.80, 24, 20.90, 4, true, 0, 2);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (11, 7, 34, 2, 346.80, 24, 28.90, 4, true, 0, 2);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (12, 7, 41, 3, 418.80, 36, 34.90, 4, true, 0, 3);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (13, 7, 42, 4, 634.80, 48, 52.90, 4, true, 0, 4);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (14, 8, 40, 3, 298.80, 36, 24.90, 4, true, 0, 3);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (15, 9, 28, 2, 617.40, 12, 102.90, 3, true, 0, 2);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (16, 10, 13, 3, 634.80, 36, 52.90, 4, true, 0, 3);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (17, 11, 7, 2, 238.80, 24, 19.90, 4, false, 2, 0);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (18, 11, 7, 2, 238.80, 24, 19.90, 4, true, 0, 2);
INSERT INTO public.detallesdelpedido (detalleid, pedidoid, varianteid, cantidadpaquetes, precioporpaquete, piezastotales, preciounitario, tamanoid, esbackorder, cantidadsurtida, cantidadbackorder) VALUES (19, 12, 15, 1, 634.80, 12, 52.90, 4, false, 1, 0);


--
-- TOC entry 4796 (class 0 OID 25153)
-- Dependencies: 261
-- Data for Name: detallesordencompra; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (2, 1, 2, 1, 0, 1, 0.00, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (1, 1, 1, 4, 0, 1, 0.00, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (3, 1, 16, 2, 0, 1, 0.00, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (4, 2, 16, 4, 0, 1, 0.00, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (8, 5, 1, 1, 1, 12, 27.93, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (9, 5, 2, 1, 1, 12, 34.93, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (6, 4, 8, 1, 1, 12, 20.93, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (7, 4, 9, 1, 1, 12, 27.93, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (5, 3, 16, 12, 12, 1, 0.00, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (10, 6, 8, 1, 0, 12, 20.93, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (11, 6, 9, 1, 0, 12, 27.93, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (12, 6, 6, 1, 0, 12, 13.23, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (14, 6, 1, 1, 0, 12, 27.93, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (15, 6, 2, 1, 0, 12, 34.93, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (16, 6, 3, 1, 0, 12, 20.93, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (17, 7, 8, 1, 0, 12, 20.93, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (18, 8, 8, 2, 2, 12, 20.93, 24);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (19, 8, 41, 2, 2, 12, 20.93, 24);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (20, 8, 42, 1, 1, 12, 32.13, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (21, 8, 31, 4, 4, 6, 41.93, 24);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (22, 8, 30, 2, 2, 6, 34.93, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (23, 8, 29, 2, 2, 6, 27.93, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (24, 8, 32, 2, 2, 6, 10.43, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (25, 8, 33, 2, 2, 6, 13.23, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (26, 8, 34, 2, 2, 6, 17.43, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (27, 8, 35, 2, 2, 6, 20.93, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (28, 8, 36, 2, 2, 6, 27.93, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (29, 8, 16, 1, 1, 12, 27.93, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (30, 8, 17, 1, 1, 12, 34.93, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (31, 8, 15, 1, 1, 12, 34.93, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (32, 8, 14, 1, 1, 12, 27.93, 12);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (33, 6, 32, 6, 0, 1, 0.00, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (34, 6, 33, 6, 0, 1, 0.00, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (35, 6, 34, 6, 0, 1, 0.00, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (36, 6, 41, 12, 0, 1, 0.00, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (37, 6, 42, 12, 0, 1, 0.00, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (38, 6, 40, 12, 0, 1, 0.00, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (39, 6, 28, 6, 0, 1, 0.00, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (40, 6, 13, 12, 0, 1, 0.00, 0);
INSERT INTO public.detallesordencompra (detalleoc_id, ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, piezasporpaquete, costounitario, piezasrecibidas) VALUES (13, 6, 7, 13, 0, 12, 13.23, 0);


--
-- TOC entry 4799 (class 0 OID 25179)
-- Dependencies: 265
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
-- TOC entry 4801 (class 0 OID 25183)
-- Dependencies: 267
-- Data for Name: itemsdelcarrito; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.itemsdelcarrito (itemid, carritoid, varianteid, cantidadpaquetes, tamanoid, cantidad) VALUES (21, 3, 40, 1, 3, 1);
INSERT INTO public.itemsdelcarrito (itemid, carritoid, varianteid, cantidadpaquetes, tamanoid, cantidad) VALUES (22, 2, 42, 1, 3, 1);
INSERT INTO public.itemsdelcarrito (itemid, carritoid, varianteid, cantidadpaquetes, tamanoid, cantidad) VALUES (23, 2, 46, 4, 2, 4);


--
-- TOC entry 4803 (class 0 OID 25187)
-- Dependencies: 269
-- Data for Name: log_eventosusuario; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 4805 (class 0 OID 25194)
-- Dependencies: 271
-- Data for Name: log_inventario; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (1, 1, '2025-12-25 19:52:37.128419', 12, 12, 'Recepción OC #5 (Lote: dsd)', 2, false, 1);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (2, 2, '2025-12-25 19:52:37.128419', 12, 12, 'Recepción OC #5 (Lote: dsd)', 2, false, 1);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (3, 8, '2025-12-25 20:02:51.311356', 12, 12, 'Recepción OC #4 (Lote: REM-100)', 2, false, 2);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (4, 9, '2025-12-25 20:02:51.311356', 12, 12, 'Recepción OC #4 (Lote: REM-100)', 2, false, 2);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (5, 16, '2025-12-25 20:03:12.735636', 12, 12, 'Recepción OC #3 (Lote: REM-101)', 2, false, 3);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (6, 30, '2025-12-26 16:21:28.544089', 36, 36, 'Auditoría Inventario - Sesión #1', 2, false, NULL);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (7, 43, '2025-12-26 16:21:28.544089', 12, 12, 'Auditoría Inventario - Sesión #1', 2, false, NULL);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (8, 34, '2025-12-26 16:21:28.544089', 6, 6, 'Auditoría Inventario - Sesión #1', 2, false, NULL);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (9, 41, '2025-12-26 16:21:28.544089', 18, 18, 'Auditoría Inventario - Sesión #1', 2, false, NULL);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (10, 29, '2025-12-26 16:26:28.884493', 18, 18, 'Auditoría Inventario - Sesión #2', 2, false, NULL);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (11, 44, '2025-12-26 16:26:28.884493', 24, 24, 'Auditoría Inventario - Sesión #2', 2, false, NULL);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (12, 42, '2025-12-26 16:26:28.884493', 14, 14, 'Auditoría Inventario - Sesión #2', 2, false, NULL);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (13, 8, '2025-12-26 16:45:46.612036', 24, 36, 'Recepción OC #8 (Lote: REM-102)', 2, false, 4);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (14, 41, '2025-12-26 16:45:46.612036', 24, 42, 'Recepción OC #8 (Lote: REM-102)', 2, false, 4);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (15, 42, '2025-12-26 16:45:46.612036', 12, 26, 'Recepción OC #8 (Lote: REM-102)', 2, false, 4);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (16, 31, '2025-12-26 16:45:46.612036', 24, 24, 'Recepción OC #8 (Lote: REM-102)', 2, false, 4);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (17, 30, '2025-12-26 16:45:46.612036', 12, 48, 'Recepción OC #8 (Lote: REM-102)', 2, false, 4);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (18, 29, '2025-12-26 16:45:46.612036', 12, 30, 'Recepción OC #8 (Lote: REM-102)', 2, false, 4);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (19, 32, '2025-12-26 16:45:46.612036', 12, 12, 'Recepción OC #8 (Lote: REM-102)', 2, false, 4);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (20, 33, '2025-12-26 16:45:46.612036', 12, 12, 'Recepción OC #8 (Lote: REM-102)', 2, false, 4);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (21, 34, '2025-12-26 16:45:46.612036', 12, 18, 'Recepción OC #8 (Lote: REM-102)', 2, false, 4);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (22, 35, '2025-12-26 16:45:46.612036', 12, 12, 'Recepción OC #8 (Lote: REM-102)', 2, false, 4);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (23, 36, '2025-12-26 16:45:46.612036', 12, 12, 'Recepción OC #8 (Lote: REM-102)', 2, false, 4);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (24, 16, '2025-12-26 16:45:46.612036', 12, 24, 'Recepción OC #8 (Lote: REM-102)', 2, false, 4);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (25, 17, '2025-12-26 16:45:46.612036', 12, 12, 'Recepción OC #8 (Lote: REM-102)', 2, false, 4);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (26, 15, '2025-12-26 16:45:46.612036', 12, 12, 'Recepción OC #8 (Lote: REM-102)', 2, false, 4);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (27, 14, '2025-12-26 16:45:46.612036', 12, 12, 'Recepción OC #8 (Lote: REM-102)', 2, false, 4);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (28, 42, '2025-12-26 17:10:47.864788', -24, 2, 'Venta Pedido #7', 1, false, NULL);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (29, 44, '2025-12-29 02:32:16.496963', -24, 0, 'Venta Pedido #11', 2, false, NULL);
INSERT INTO public.log_inventario (logid, varianteid, fecha, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id) VALUES (30, 14, '2025-12-29 02:33:04.229328', -12, 0, 'Venta Pedido #12', 2, false, NULL);


--
-- TOC entry 4807 (class 0 OID 25200)
-- Dependencies: 273
-- Data for Name: log_movimientos; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (1, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-19 17:44:44.70313');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (2, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-21 03:10:48.361285');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (3, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-21 03:22:54.963486');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (4, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-01-21 13:05:53.021814');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (5, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-21 23:06:54.936308');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (6, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-23 10:31:28.078154');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (7, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-23 17:27:27.440229');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (8, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-24 15:11:55.852066');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (9, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-24 15:48:40.613163');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (10, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-24 16:21:37.736107');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (11, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-24 17:24:07.495567');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (12, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-24 17:34:24.897833');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (13, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 01:19:09.330466');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (14, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 01:31:32.982585');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (15, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 01:45:49.212772');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (16, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 04:41:59.557446');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (17, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 04:54:23.300349');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (18, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 05:31:34.851744');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (19, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 05:32:03.625798');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (20, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 05:32:52.624282');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (21, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 05:58:21.962888');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (22, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 06:04:33.937125');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (23, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 06:13:09.118312');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (24, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 06:30:20.099103');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (25, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 11:25:30.571097');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (26, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 11:40:36.396928');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (27, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 12:02:33.026517');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (28, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 12:09:17.08571');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (29, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 12:10:27.458313');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (30, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 12:11:38.034496');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (31, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 12:19:14.529547');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (32, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 12:34:52.584294');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (33, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 13:41:19.817334');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (34, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 14:41:13.940063');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (35, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 14:56:26.889649');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (36, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 15:01:23.606116');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (37, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 15:06:31.050398');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (38, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 15:35:20.936186');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (39, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 15:43:10.210438');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (40, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 18:36:24.250325');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (41, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 18:49:22.633459');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (42, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 19:47:50.808564');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (43, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-25 23:55:49.263405');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (47, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 11:24:59.972304');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (48, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 13:24:53.74109');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (49, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 14:06:13.224752');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (50, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 14:08:03.029251');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (51, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 14:18:45.408608');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (52, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 14:31:21.1354');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (53, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 14:54:44.291244');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (54, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 15:14:27.769036');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (55, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 15:22:31.023682');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (56, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 15:50:50.04375');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (57, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 15:57:36.203924');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (58, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 16:05:34.397158');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (59, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 16:26:14.976359');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (60, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 16:52:11.296839');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (61, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 16:57:57.476266');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (62, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 17:13:40.787361');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (63, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-26 17:22:34.902303');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (66, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-29 01:11:08.725746');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (67, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-29 01:25:08.412077');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (68, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-29 01:33:04.711796');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (69, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-29 01:50:00.316987');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (70, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-29 01:51:26.679781');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (71, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-29 02:00:50.047702');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (72, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-29 02:01:47.055847');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (73, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-29 02:23:15.196811');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (74, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-29 02:25:17.465547');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (75, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-29 02:33:39.884112');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (76, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-29 02:34:52.849064');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (77, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.130.6', '2025-12-30 10:15:15.787099');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (78, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.130.6', '2025-12-30 10:15:27.792344');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (79, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.130.6', '2025-12-30 10:18:18.673608');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (80, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.130.6', '2025-12-30 10:18:25.803414');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (81, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.130.6', '2025-12-30 10:18:57.992311');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (82, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.130.3', '2025-12-30 10:36:20.661018');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (83, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.129.3', '2025-12-30 23:59:47.520289');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (84, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.129.3', '2025-12-31 00:04:53.276591');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (85, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.129.3', '2025-12-31 00:07:09.422888');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (86, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.129.2', '2025-12-31 06:49:38.252623');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (87, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-31 07:16:39.372519');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (88, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-31 07:45:14.452949');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (89, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-31 07:57:37.896324');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (90, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-31 08:06:45.012658');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (91, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-31 08:07:54.748972');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (92, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.129.5', '2025-12-31 08:15:51.915203');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (93, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-31 08:16:37.349904');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (94, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.129.3', '2025-12-31 08:49:42.289999');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (95, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.129.3', '2025-12-31 08:53:03.312742');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (96, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.129.5', '2025-12-31 09:14:08.184367');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (97, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-31 09:17:59.699275');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (98, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-31 10:50:50.504272');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (99, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-31 11:35:41.63637');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (100, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.129.2', '2025-12-31 12:07:59.314469');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (101, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.129.2', '2025-12-31 12:08:57.155299');
INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (102, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '169.254.129.2', '2025-12-31 12:09:29.438594');


--
-- TOC entry 4809 (class 0 OID 25208)
-- Dependencies: 275
-- Data for Name: medidas; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 4798 (class 0 OID 25162)
-- Dependencies: 263
-- Data for Name: notificaciones; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (3, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó proveedores #1.', false, '2025-12-24 16:37:12.726854', '{"entidad": "proveedores", "cambio_id": 2, "entidad_id": 1, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (4, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó productos #1.', false, '2025-12-24 17:14:16.694254', '{"entidad": "productos", "cambio_id": 3, "entidad_id": 1, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (5, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #1.', false, '2025-12-24 17:15:17.319869', '{"entidad": "productos", "cambio_id": 4, "entidad_id": 1, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (6, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó productos #2.', false, '2025-12-25 06:07:04.374021', '{"entidad": "productos", "cambio_id": 5, "entidad_id": 2, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (7, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó productos #3.', false, '2025-12-25 06:10:40.967142', '{"entidad": "productos", "cambio_id": 6, "entidad_id": 3, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (8, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó productos #4.', false, '2025-12-25 06:14:06.922624', '{"entidad": "productos", "cambio_id": 7, "entidad_id": 4, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (9, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó productos #5.', false, '2025-12-25 06:20:27.639225', '{"entidad": "productos", "cambio_id": 8, "entidad_id": 5, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (10, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó productos #6.', false, '2025-12-25 06:23:13.822462', '{"entidad": "productos", "cambio_id": 9, "entidad_id": 6, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (11, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó productos #7.', false, '2025-12-25 06:25:42.061306', '{"entidad": "productos", "cambio_id": 10, "entidad_id": 7, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (12, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó productos #8.', false, '2025-12-25 06:27:35.102463', '{"entidad": "productos", "cambio_id": 11, "entidad_id": 8, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (13, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #4.', false, '2025-12-25 11:28:36.990578', '{"entidad": "productos", "cambio_id": 12, "entidad_id": 4, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (14, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #4.', false, '2025-12-25 11:29:47.977221', '{"entidad": "productos", "cambio_id": 13, "entidad_id": 4, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (15, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #3.', false, '2025-12-25 11:30:03.553541', '{"entidad": "productos", "cambio_id": 14, "entidad_id": 3, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (16, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #6.', false, '2025-12-25 11:30:42.274892', '{"entidad": "productos", "cambio_id": 15, "entidad_id": 6, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (17, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #6.', false, '2025-12-25 11:31:04.690791', '{"entidad": "productos", "cambio_id": 16, "entidad_id": 6, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (18, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #1.', false, '2025-12-25 11:31:18.494085', '{"entidad": "productos", "cambio_id": 17, "entidad_id": 1, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (19, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #5.', false, '2025-12-25 11:31:44.891947', '{"entidad": "productos", "cambio_id": 18, "entidad_id": 5, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (20, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #8.', false, '2025-12-25 11:31:56.482915', '{"entidad": "productos", "cambio_id": 19, "entidad_id": 8, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (21, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #2.', false, '2025-12-25 11:32:11.936784', '{"entidad": "productos", "cambio_id": 20, "entidad_id": 2, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (22, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #7.', false, '2025-12-25 11:32:25.476172', '{"entidad": "productos", "cambio_id": 21, "entidad_id": 7, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (23, NULL, 'pedido', 'Auditoría Pasiva - Pedido actualizado', 'El usuario Fernando actualizó el pedido #4.', false, '2025-12-25 12:03:24.115311', '{"entidad": "pedidos", "cambio_id": 22, "entidad_id": 4, "tipo_cambio": "UPDATE"}', '/admin-pedidos.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (24, NULL, 'pedido', 'Auditoría Pasiva - Pedido actualizado', 'El usuario Fernando actualizó el pedido #4.', false, '2025-12-25 12:03:36.15595', '{"entidad": "pedidos", "cambio_id": 23, "entidad_id": 4, "tipo_cambio": "UPDATE"}', '/admin-pedidos.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (25, NULL, 'pedido', 'Auditoría Pasiva - Pedido actualizado', 'El usuario Fernando actualizó el pedido #4.', false, '2025-12-25 12:04:12.946149', '{"entidad": "pedidos", "cambio_id": 24, "entidad_id": 4, "tipo_cambio": "UPDATE"}', '/admin-pedidos.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (26, NULL, 'pedido', 'Auditoría Pasiva - Pedido actualizado', 'El usuario Fernando actualizó el pedido #4.', false, '2025-12-25 12:05:20.270511', '{"entidad": "pedidos", "cambio_id": 25, "entidad_id": 4, "tipo_cambio": "UPDATE"}', '/admin-pedidos.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (27, NULL, 'pedido', 'Auditoría Pasiva - Pedido actualizado', 'El usuario Fernando actualizó el pedido #6.', false, '2025-12-25 12:35:08.780706', '{"entidad": "pedidos", "cambio_id": 26, "entidad_id": 6, "tipo_cambio": "UPDATE"}', '/admin-pedidos.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (28, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó proveedores #3.', false, '2025-12-26 13:40:58.949156', '{"entidad": "proveedores", "cambio_id": 27, "entidad_id": 3, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (30, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó productos #9.', false, '2025-12-26 13:52:22.61446', '{"entidad": "productos", "cambio_id": 29, "entidad_id": 9, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (31, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #9.', false, '2025-12-26 14:55:23.054933', '{"entidad": "productos", "cambio_id": 30, "entidad_id": 9, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (32, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó productos #10.', false, '2025-12-26 15:04:45.282758', '{"entidad": "productos", "cambio_id": 31, "entidad_id": 10, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (33, NULL, 'sistema', 'Auditoría de Inventario Requerida', 'Se requiere tu participación en la toma de inventario: Inv 26-dic.', false, '2025-12-26 15:14:54.217075', NULL, '/admin-toma-inventario.html?sesionId=1', 'alta', NULL, 1);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (34, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó productos #11.', false, '2025-12-26 15:27:12.85772', '{"entidad": "productos", "cambio_id": 32, "entidad_id": 11, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (35, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #3.', false, '2025-12-26 15:31:45.722832', '{"entidad": "productos", "cambio_id": 33, "entidad_id": 3, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (37, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó productos #12.', false, '2025-12-26 15:36:29.452485', '{"entidad": "productos", "cambio_id": 35, "entidad_id": 12, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (38, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó productos #13.', false, '2025-12-26 15:45:16.851933', '{"entidad": "productos", "cambio_id": 36, "entidad_id": 13, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (39, NULL, 'sistema', 'Auditoría de Inventario Requerida', 'Se requiere tu participación en la toma de inventario: Corrección Inv 26-dic.', false, '2025-12-26 16:22:38.634423', NULL, '/admin-toma-inventario.html?sesionId=2', 'alta', NULL, 1);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (40, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #13.', false, '2025-12-26 16:30:15.033207', '{"entidad": "productos", "cambio_id": 37, "entidad_id": 13, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (41, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #13.', false, '2025-12-26 16:32:10.707092', '{"entidad": "productos", "cambio_id": 38, "entidad_id": 13, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (42, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #13.', false, '2025-12-26 16:38:02.664096', '{"entidad": "productos", "cambio_id": 39, "entidad_id": 13, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (43, 3, 'sistema', '¡Bienvenido a RazoConnect!', 'Gracias por unirte. Tu cuenta ha sido creada exitosamente.', false, '2025-12-30 18:21:12.515244', '{}', NULL, 'normal', NULL, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (44, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #10.', false, '2025-12-31 08:52:28.763586', '{"entidad": "productos", "cambio_id": 40, "entidad_id": 10, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (45, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando creó productos #14.', false, '2025-12-31 08:56:50.290808', '{"entidad": "productos", "cambio_id": 41, "entidad_id": 14, "tipo_cambio": "INSERT"}', '/admin-bitacora.html', 'alta', 2, NULL);
INSERT INTO public.notificaciones (notificacionid, clienteid, tipo, titulo, mensaje, leida, fechacreacion, metadata, url, prioridad, administrador_id, agente_id) VALUES (46, NULL, 'producto', 'Auditoría Pasiva - Cambio aplicado', 'El usuario Fernando actualizó productos #14.', false, '2025-12-31 09:15:49.786122', '{"entidad": "productos", "cambio_id": 42, "entidad_id": 14, "tipo_cambio": "UPDATE"}', '/admin-bitacora.html', 'alta', 2, NULL);


--
-- TOC entry 4812 (class 0 OID 25217)
-- Dependencies: 278
-- Data for Name: ordenesdecompra; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.ordenesdecompra (ordencompraid, proveedorid, fechacreacion, fechaentregaesperada, estatus, origenoc, fechasolicitud, total, usuario_creador_id, exportado_en, reporte_id) VALUES (1, 1, '2025-12-25 04:39:40.211208', '2026-01-08', 'Cancelada', 'backorder', '2025-12-25 04:39:40.211208', 0.00, NULL, NULL, NULL);
INSERT INTO public.ordenesdecompra (ordencompraid, proveedorid, fechacreacion, fechaentregaesperada, estatus, origenoc, fechasolicitud, total, usuario_creador_id, exportado_en, reporte_id) VALUES (2, 1, '2025-12-25 12:16:00.748743', '2026-01-08', 'Cancelada', 'backorder', '2025-12-25 12:16:00.748743', 0.00, NULL, NULL, NULL);
INSERT INTO public.ordenesdecompra (ordencompraid, proveedorid, fechacreacion, fechaentregaesperada, estatus, origenoc, fechasolicitud, total, usuario_creador_id, exportado_en, reporte_id) VALUES (5, 1, '2025-12-25 15:55:55.965868', '2026-01-01', 'Completada', 'manual', '2025-12-25 15:55:55.965868', 754.32, NULL, NULL, NULL);
INSERT INTO public.ordenesdecompra (ordencompraid, proveedorid, fechacreacion, fechaentregaesperada, estatus, origenoc, fechasolicitud, total, usuario_creador_id, exportado_en, reporte_id) VALUES (4, 1, '2025-12-25 15:07:50.675653', '2025-12-26', 'Completada', 'manual', '2025-12-25 15:07:50.675653', 586.32, NULL, NULL, NULL);
INSERT INTO public.ordenesdecompra (ordencompraid, proveedorid, fechacreacion, fechaentregaesperada, estatus, origenoc, fechasolicitud, total, usuario_creador_id, exportado_en, reporte_id) VALUES (3, 1, '2025-12-25 12:34:25.543147', '2026-01-08', 'Completada', 'backorder', '2025-12-25 12:34:25.543147', 335.16, NULL, NULL, NULL);
INSERT INTO public.ordenesdecompra (ordencompraid, proveedorid, fechacreacion, fechaentregaesperada, estatus, origenoc, fechasolicitud, total, usuario_creador_id, exportado_en, reporte_id) VALUES (6, 1, '2025-12-26 13:32:01.347641', '2025-12-27', 'Pendiente', 'manual', '2025-12-26 13:32:01.347641', 159.11, NULL, NULL, NULL);
INSERT INTO public.ordenesdecompra (ordencompraid, proveedorid, fechacreacion, fechaentregaesperada, estatus, origenoc, fechasolicitud, total, usuario_creador_id, exportado_en, reporte_id) VALUES (7, 1, '2025-12-26 16:38:29.49725', '2025-12-27', 'Pendiente', 'manual', '2025-12-26 16:38:29.49725', 20.93, NULL, NULL, NULL);
INSERT INTO public.ordenesdecompra (ordencompraid, proveedorid, fechacreacion, fechaentregaesperada, estatus, origenoc, fechasolicitud, total, usuario_creador_id, exportado_en, reporte_id) VALUES (8, 1, '2025-12-26 16:42:15.813976', '2025-12-31', 'Completada', 'manual', '2025-12-26 16:42:15.813976', 5738.88, NULL, NULL, NULL);


--
-- TOC entry 4814 (class 0 OID 25227)
-- Dependencies: 280
-- Data for Name: pagos_clientes; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.pagos_clientes (pago_id, cliente_id, credito_id, monto, tipo_pago, estatus, comprobante_url, referencia_bancaria, transaccion_id, fecha_pago, fecha_validacion, validado_por, notas, movimientos_aplicados) VALUES (1, 2, 1, 1000.00, 'TRANSFERENCIA', 'APROBADO', NULL, 'Transferencia bancaria', NULL, '2025-12-29 01:24:59.134773', '2025-12-29 01:50:15.018607', 2, NULL, '[]');
INSERT INTO public.pagos_clientes (pago_id, cliente_id, credito_id, monto, tipo_pago, estatus, comprobante_url, referencia_bancaria, transaccion_id, fecha_pago, fecha_validacion, validado_por, notas, movimientos_aplicados) VALUES (2, 2, 1, 3552.00, 'TRANSFERENCIA', 'APROBADO', NULL, 'Transferencia bancaria', NULL, '2025-12-29 01:51:12.933837', '2025-12-29 01:52:11.010275', 2, NULL, '[6, 5, 4, 3, 2, 1]');
INSERT INTO public.pagos_clientes (pago_id, cliente_id, credito_id, monto, tipo_pago, estatus, comprobante_url, referencia_bancaria, transaccion_id, fecha_pago, fecha_validacion, validado_por, notas, movimientos_aplicados) VALUES (3, 2, 1, 3552.00, 'TRANSFERENCIA', 'APROBADO', NULL, 'Transferencia bancaria', NULL, '2025-12-29 02:23:02.387275', '2025-12-29 02:23:38.907428', 2, NULL, '["PED-1", "PED-2", "PED-3", "PED-4", "PED-5", "PED-6"]');
INSERT INTO public.pagos_clientes (pago_id, cliente_id, credito_id, monto, tipo_pago, estatus, comprobante_url, referencia_bancaria, transaccion_id, fecha_pago, fecha_validacion, validado_por, notas, movimientos_aplicados) VALUES (4, 2, 1, 4448.40, 'TRANSFERENCIA', 'APROBADO', NULL, 'Transferencia bancaria', NULL, '2025-12-29 02:25:08.294392', '2025-12-29 02:25:30.216642', 2, NULL, '["PED-1", "PED-2", "PED-3", "PED-4", "PED-5", "PED-6", "PED-8"]');
INSERT INTO public.pagos_clientes (pago_id, cliente_id, credito_id, monto, tipo_pago, estatus, comprobante_url, referencia_bancaria, transaccion_id, fecha_pago, fecha_validacion, validado_por, notas, movimientos_aplicados) VALUES (5, 2, 1, 1234.80, 'TRANSFERENCIA', 'APROBADO', NULL, 'Transferencia bancaria', NULL, '2025-12-29 02:33:33.787312', '2025-12-29 02:34:05.660581', 2, NULL, '["PED-9"]');
INSERT INTO public.pagos_clientes (pago_id, cliente_id, credito_id, monto, tipo_pago, estatus, comprobante_url, referencia_bancaria, transaccion_id, fecha_pago, fecha_validacion, validado_por, notas, movimientos_aplicados) VALUES (6, 2, 1, 4729.20, 'TRANSFERENCIA', 'APROBADO', NULL, 'Transferencia bancaria', NULL, '2025-12-29 02:34:46.775749', '2025-12-29 02:34:59.970783', 2, NULL, '["PED-9", "PED-10", "PED-11", "PED-12"]');


--
-- TOC entry 4816 (class 0 OID 25239)
-- Dependencies: 282
-- Data for Name: pagos_cxp; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.pagos_cxp (pago_id, cxp_id, fecha_pago, monto, metodo_pago, referencia_bancaria, comprobante_url, nota, usuario_id) VALUES (1, 2, '2025-12-25 20:04:06.35046', 586.32, NULL, 'Transferencia', NULL, 'Transferencia', 2);
INSERT INTO public.pagos_cxp (pago_id, cxp_id, fecha_pago, monto, metodo_pago, referencia_bancaria, comprobante_url, nota, usuario_id) VALUES (2, 1, '2025-12-25 20:04:18.121912', 754.32, NULL, 'Transferencia', NULL, 'Transferencia', 2);


--
-- TOC entry 4818 (class 0 OID 25247)
-- Dependencies: 284
-- Data for Name: passwordresettokens; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 4820 (class 0 OID 25252)
-- Dependencies: 286
-- Data for Name: pedidos; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.pedidos (pedidoid, clienteid, agenteid, direccionenvioid, fechapedido, montototal, estatus, costoenvio, es_credito, fecha_vencimiento, pagado, transaccion_id, comprobante_url, metodo_pago, cupon_id, monto_descuento) VALUES (1, 2, NULL, 1, '2025-12-25 04:39:40.211208', 171.60, 'Parcialmente Surtido', 0.00, true, '2026-01-09 04:39:40.211208', false, NULL, NULL, 'credito', NULL, 0.00);
INSERT INTO public.pedidos (pedidoid, clienteid, agenteid, direccionenvioid, fechapedido, montototal, estatus, costoenvio, es_credito, fecha_vencimiento, pagado, transaccion_id, comprobante_url, metodo_pago, cupon_id, monto_descuento) VALUES (2, 2, NULL, 1, '2025-12-25 04:48:35.466116', 634.80, 'Parcialmente Surtido', 0.00, true, '2026-01-09 04:48:35.466116', false, NULL, NULL, 'credito', NULL, 0.00);
INSERT INTO public.pedidos (pedidoid, clienteid, agenteid, direccionenvioid, fechapedido, montototal, estatus, costoenvio, es_credito, fecha_vencimiento, pagado, transaccion_id, comprobante_url, metodo_pago, cupon_id, monto_descuento) VALUES (3, 2, NULL, 1, '2025-12-25 05:32:44.889936', 1544.40, 'Parcialmente Surtido', 0.00, true, '2026-01-09 05:32:44.889936', false, NULL, NULL, 'credito', NULL, 0.00);
INSERT INTO public.pedidos (pedidoid, clienteid, agenteid, direccionenvioid, fechapedido, montototal, estatus, costoenvio, es_credito, fecha_vencimiento, pagado, transaccion_id, comprobante_url, metodo_pago, cupon_id, monto_descuento) VALUES (4, 2, NULL, 1, '2025-12-25 11:24:59.074676', 343.20, 'Entregado', 0.00, true, '2026-01-09 11:24:59.074676', false, NULL, NULL, 'credito', NULL, 0.00);
INSERT INTO public.pedidos (pedidoid, clienteid, agenteid, direccionenvioid, fechapedido, montototal, estatus, costoenvio, es_credito, fecha_vencimiento, pagado, transaccion_id, comprobante_url, metodo_pago, cupon_id, monto_descuento) VALUES (5, 2, NULL, 1, '2025-12-25 12:16:00.748743', 686.40, 'Parcialmente Surtido', 0.00, true, '2026-01-09 12:16:00.748743', false, NULL, NULL, 'credito', NULL, 0.00);
INSERT INTO public.pedidos (pedidoid, clienteid, agenteid, direccionenvioid, fechapedido, montototal, estatus, costoenvio, es_credito, fecha_vencimiento, pagado, transaccion_id, comprobante_url, metodo_pago, cupon_id, monto_descuento) VALUES (6, 2, NULL, 1, '2025-12-25 12:34:25.543147', 171.60, 'Confirmado', 0.00, true, '2026-01-09 12:34:25.543147', false, NULL, NULL, 'credito', NULL, 0.00);
INSERT INTO public.pedidos (pedidoid, clienteid, agenteid, direccionenvioid, fechapedido, montototal, estatus, costoenvio, es_credito, fecha_vencimiento, pagado, transaccion_id, comprobante_url, metodo_pago, cupon_id, monto_descuento) VALUES (7, 1, NULL, 2, '2025-12-26 17:10:47.864788', 5994.00, 'Parcialmente Surtido', 0.00, true, '2026-01-10 17:10:47.864788', false, NULL, NULL, 'credito', NULL, 0.00);
INSERT INTO public.pedidos (pedidoid, clienteid, agenteid, direccionenvioid, fechapedido, montototal, estatus, costoenvio, es_credito, fecha_vencimiento, pagado, transaccion_id, comprobante_url, metodo_pago, cupon_id, monto_descuento) VALUES (8, 2, NULL, 1, '2025-12-29 02:01:37.762643', 896.40, 'Parcialmente Surtido', 0.00, true, '2026-01-13 02:01:37.762643', false, NULL, NULL, 'credito', NULL, 0.00);
INSERT INTO public.pedidos (pedidoid, clienteid, agenteid, direccionenvioid, fechapedido, montototal, estatus, costoenvio, es_credito, fecha_vencimiento, pagado, transaccion_id, comprobante_url, metodo_pago, cupon_id, monto_descuento) VALUES (9, 2, NULL, 1, '2025-12-29 02:31:02.579417', 1234.80, 'Parcialmente Surtido', 0.00, true, '2026-01-13 02:31:02.579417', false, NULL, NULL, 'credito', NULL, 0.00);
INSERT INTO public.pedidos (pedidoid, clienteid, agenteid, direccionenvioid, fechapedido, montototal, estatus, costoenvio, es_credito, fecha_vencimiento, pagado, transaccion_id, comprobante_url, metodo_pago, cupon_id, monto_descuento) VALUES (10, 2, NULL, 1, '2025-12-29 02:31:35.046362', 1904.40, 'Parcialmente Surtido', 0.00, true, '2026-01-13 02:31:35.046362', false, NULL, NULL, 'credito', NULL, 0.00);
INSERT INTO public.pedidos (pedidoid, clienteid, agenteid, direccionenvioid, fechapedido, montototal, estatus, costoenvio, es_credito, fecha_vencimiento, pagado, transaccion_id, comprobante_url, metodo_pago, cupon_id, monto_descuento) VALUES (11, 2, NULL, 1, '2025-12-29 02:32:16.496963', 955.20, 'Parcialmente Surtido', 0.00, true, '2026-01-13 02:32:16.496963', false, NULL, NULL, 'credito', NULL, 0.00);
INSERT INTO public.pedidos (pedidoid, clienteid, agenteid, direccionenvioid, fechapedido, montototal, estatus, costoenvio, es_credito, fecha_vencimiento, pagado, transaccion_id, comprobante_url, metodo_pago, cupon_id, monto_descuento) VALUES (12, 2, NULL, 1, '2025-12-29 02:33:04.229328', 634.80, 'Aprobado', 0.00, true, '2026-01-13 02:33:04.229328', false, NULL, NULL, 'credito', NULL, 0.00);


--
-- TOC entry 4822 (class 0 OID 25263)
-- Dependencies: 288
-- Data for Name: producto_imagenes; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (20, '/uploads/1766665229272-Captura de pantalla 2025-12-25 061852.png', NULL, 2, 5);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (21, '/uploads/1766665229274-Captura de pantalla 2025-12-25 061857.png', NULL, 3, 5);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (22, '/uploads/1766665229276-Captura de pantalla 2025-12-25 061905.png', NULL, 4, 5);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (23, '/uploads/1766665229277-Captura de pantalla 2025-12-25 061909.png', NULL, 5, 5);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (34, '/uploads/1766665656386-Captura de pantalla 2025-12-25 062641.png', NULL, 1, 8);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (35, '/uploads/1766665656389-Captura de pantalla 2025-12-25 062709.png', NULL, 2, 8);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (36, '/uploads/1766665656390-Captura de pantalla 2025-12-25 062714.png', NULL, 3, 8);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (37, '/uploads/1766665656391-Captura de pantalla 2025-12-25 062719.png', NULL, 4, 8);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (38, '/uploads/1766665656392-Captura de pantalla 2025-12-25 062723.png', NULL, 5, 8);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (15, '/uploads/1766664848035-Captura de pantalla 2025-12-24 163440.png', NULL, 1, 4);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (16, '/uploads/1766664848038-Captura de pantalla 2025-12-24 163451.png', NULL, 2, 4);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (17, '/uploads/1766664848039-Captura de pantalla 2025-12-24 163527.png', NULL, 3, 4);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (18, '/uploads/1766664848040-Captura de pantalla 2025-12-24 163532.png', NULL, 4, 4);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (6, '/uploads/1766664426099-Captura de pantalla 2025-12-24 163348.png', NULL, 1, 2);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (7, '/uploads/1766664426106-Captura de pantalla 2025-12-24 163354.png', NULL, 2, 2);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (8, '/uploads/1766664426106-Captura de pantalla 2025-12-24 163400.png', NULL, 3, 2);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (9, '/uploads/1766664426107-Captura de pantalla 2025-12-24 163410.png', NULL, 4, 2);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (10, '/uploads/1766664426107-Captura de pantalla 2025-12-24 163415.png', NULL, 5, 2);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (24, '/uploads/1766665395737-Captura de pantalla 2025-12-25 062226.png', NULL, 1, 6);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (25, '/uploads/1766665395742-Captura de pantalla 2025-12-25 062231.png', NULL, 2, 6);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (26, '/uploads/1766665395745-Captura de pantalla 2025-12-25 062235.png', NULL, 3, 6);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (27, '/uploads/1766665395746-Captura de pantalla 2025-12-25 062241.png', NULL, 4, 6);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (28, '/uploads/1766665395748-Captura de pantalla 2025-12-25 062246.png', NULL, 5, 6);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (1, '/uploads/1766618057659-Captura de pantalla 2025-12-24 163339.png', NULL, 1, 1);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (2, '/uploads/1766618057669-Captura de pantalla 2025-12-24 163230.png', NULL, 2, 1);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (3, '/uploads/1766618057672-Captura de pantalla 2025-12-24 163242.png', NULL, 3, 1);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (4, '/uploads/1766618057674-Captura de pantalla 2025-12-24 163309.png', NULL, 4, 1);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (5, '/uploads/1766618057676-Captura de pantalla 2025-12-24 163317.png', NULL, 5, 1);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (19, '/uploads/1766665229257-Captura de pantalla 2025-12-25 061846.png', NULL, 1, 5);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (11, '/uploads/1766664426108-Captura de pantalla 2025-12-24 163420.png', NULL, 6, 2);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (12, '/uploads/1766664426108-Captura de pantalla 2025-12-24 163430.png', NULL, 7, 2);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (29, '/uploads/1766665543356-Captura de pantalla 2025-12-25 062438.png', NULL, 1, 7);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (30, '/uploads/1766665543360-Captura de pantalla 2025-12-25 062445.png', NULL, 2, 7);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (31, '/uploads/1766665543362-Captura de pantalla 2025-12-25 062451.png', NULL, 3, 7);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (32, '/uploads/1766665543363-Captura de pantalla 2025-12-25 062455.png', NULL, 4, 7);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (33, '/uploads/1766665543366-Captura de pantalla 2025-12-25 062501.png', NULL, 5, 7);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (39, '/uploads/1766778746726-Captura de pantalla 2025-12-26 133323.png', NULL, 1, 9);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (40, '/uploads/1766778746732-Captura de pantalla 2025-12-26 133344.png', NULL, 2, 9);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (41, '/uploads/1766778746734-Captura de pantalla 2025-12-26 133348.png', NULL, 3, 9);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (42, '/uploads/1766778746738-Captura de pantalla 2025-12-26 133356.png', NULL, 4, 9);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (43, '/uploads/1766778746741-Captura de pantalla 2025-12-26 133404.png', NULL, 5, 9);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (13, '/uploads/1766664642259-Captura de pantalla 2025-12-25 060942.png', NULL, 1, 3);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (14, '/uploads/1766664642264-Captura de pantalla 2025-12-25 060954.png', NULL, 2, 3);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (47, '/uploads/1766785521330-Captura de pantalla 2025-12-26 154429.png', NULL, 1, 13);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (44, '/uploads/1766783087272-Captura de pantalla 2025-12-26 133425.png', NULL, 1, 10);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (45, '/uploads/1766783087299-Captura de pantalla 2025-12-26 133433.png', NULL, 2, 10);
INSERT INTO public.producto_imagenes (imagenid, url_imagen, textoalternativo, orden, productoid) VALUES (46, '/uploads/1766783087314-Captura de pantalla 2025-12-26 133436.png', NULL, 3, 10);


--
-- TOC entry 4844 (class 0 OID 25877)
-- Dependencies: 311
-- Data for Name: producto_imagenes_color; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 4824 (class 0 OID 25270)
-- Dependencies: 290
-- Data for Name: producto_tamanosdisponibles; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (1, 5);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (1, 4);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (2, 3);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (2, 4);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (3, 3);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (3, 4);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (4, 5);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (4, 4);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (5, 5);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (5, 4);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (6, 5);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (6, 4);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (7, 5);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (7, 4);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (8, 5);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (8, 4);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (9, 5);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (9, 3);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (9, 4);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (10, 3);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (11, 2);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (11, 5);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (11, 3);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (12, 3);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (12, 4);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (13, 3);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (13, 4);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (14, 2);
INSERT INTO public.producto_tamanosdisponibles (productoid, tamanoid) VALUES (14, 3);


--
-- TOC entry 4825 (class 0 OID 25273)
-- Dependencies: 291
-- Data for Name: producto_variante_imagenes; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.producto_variante_imagenes (imagenid, url_imagen, textoalternativo, orden, varianteid) VALUES (1, '/uploads/1766664669210-Captura de pantalla 2025-12-25 060942.png', NULL, 1, 6);
INSERT INTO public.producto_variante_imagenes (imagenid, url_imagen, textoalternativo, orden, varianteid) VALUES (2, '/uploads/1766664700177-Captura de pantalla 2025-12-25 060954.png', NULL, 1, 7);
INSERT INTO public.producto_variante_imagenes (imagenid, url_imagen, textoalternativo, orden, varianteid) VALUES (4, '/uploads/1766780491765-Captura de pantalla 2025-12-26 133323.png', NULL, 1, 18);
INSERT INTO public.producto_variante_imagenes (imagenid, url_imagen, textoalternativo, orden, varianteid) VALUES (5, '/uploads/1766780491771-Captura de pantalla 2025-12-26 133344.png', NULL, 2, 18);
INSERT INTO public.producto_variante_imagenes (imagenid, url_imagen, textoalternativo, orden, varianteid) VALUES (6, '/uploads/1766780491774-Captura de pantalla 2025-12-26 133348.png', NULL, 3, 18);
INSERT INTO public.producto_variante_imagenes (imagenid, url_imagen, textoalternativo, orden, varianteid) VALUES (7, '/uploads/1766780491775-Captura de pantalla 2025-12-26 133356.png', NULL, 4, 18);
INSERT INTO public.producto_variante_imagenes (imagenid, url_imagen, textoalternativo, orden, varianteid) VALUES (8, '/uploads/1766780491793-Captura de pantalla 2025-12-26 133404.png', NULL, 5, 18);
INSERT INTO public.producto_variante_imagenes (imagenid, url_imagen, textoalternativo, orden, varianteid) VALUES (9, '/uploads/1766780708466-Captura de pantalla 2025-12-26 133314.png', NULL, 1, 23);
INSERT INTO public.producto_variante_imagenes (imagenid, url_imagen, textoalternativo, orden, varianteid) VALUES (10, '/uploads/1766784498740-Captura de pantalla 2025-12-26 151748.png', NULL, 1, 29);
INSERT INTO public.producto_variante_imagenes (imagenid, url_imagen, textoalternativo, orden, varianteid) VALUES (11, 'https://res.cloudinary.com/daylne1ml/image/upload/v1767182907/razoconnect_productos/vdzf7ow2wfo08nehdjlf.png', NULL, 1, 46);


--
-- TOC entry 4827 (class 0 OID 25280)
-- Dependencies: 293
-- Data for Name: producto_variantes; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (38, 'NAT-001-50X50', '50x50', 76.93, 0, NULL, NULL, 12, 119.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (18, 'AMO-018-20X20', '20x20', 41.93, 0, NULL, NULL, 9, 62.90, NULL, true, 1, 0, 'Diseño', NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (23, 'AMO-018-15X15-LISO', '15x15', 34.93, 0, NULL, NULL, 9, 50.90, NULL, true, 1, 0, 'Liso', NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (39, 'NAT-001-65X65', '65x65', 104.93, 0, NULL, NULL, 12, 159.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (40, 'NAT-002-MED', 'Mediana', 13.93, 0, NULL, NULL, 13, 24.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (19, 'AMO-018-25X25', '25x25', 48.93, 0, NULL, NULL, 9, 72.90, NULL, true, 1, 0, 'Diseño', NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (24, 'AMO-018-20X20-LISO', '20x20', 41.93, 0, NULL, NULL, 9, 62.90, NULL, true, 1, 0, 'Liso', NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (25, 'AMO-018-25X25-LISO', '25x25', 48.93, 0, NULL, NULL, 9, 72.90, NULL, true, 1, 0, 'Liso', NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (26, 'AMO-018-30X30-LISO', '30x30', 55.93, 0, NULL, NULL, 9, 84.90, NULL, true, 1, 0, 'Liso', NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (27, 'AMO-018-50X50-LISO', '50x50', 111.93, 0, NULL, NULL, 9, 167.90, NULL, true, 1, 0, 'Liso', NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (1, 'AMO-001', '20x20', 27.93, 12, NULL, NULL, 1, 42.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (2, 'AMO-002', '25x25', 34.93, 12, NULL, NULL, 1, 52.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (3, 'AMO-003', '15x15', 20.93, 0, NULL, NULL, 2, 30.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (4, 'AMO-004', '20x20', 27.93, 0, NULL, NULL, 2, 42.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (5, 'AMO-005', '25x25', 34.93, 0, NULL, NULL, 2, 52.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (6, 'AMO-006', '10x10', 13.23, 0, NULL, NULL, 3, 19.90, NULL, true, 1, 0, 'Rojo', NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (7, 'AMO-007', '10x10', 13.23, 0, NULL, NULL, 3, 19.90, NULL, true, 1, 0, 'Negro', NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (9, 'AMO-009', '20x20', 27.93, 12, NULL, NULL, 4, 42.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (10, 'AMO-010', '10x10', 13.23, 0, NULL, NULL, 5, 19.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (11, 'AMO-011', '20x20', 27.93, 0, NULL, NULL, 5, 42.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (12, 'AMO-012', '20x20', 27.93, 0, NULL, NULL, 6, 42.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (13, 'AMO-013', '25x25', 34.93, 0, NULL, NULL, 6, 52.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (28, 'AMO-019-17X22', '17x22', 69.93, 0, NULL, NULL, 10, 102.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (30, 'LIS-001-25X25-MAGENT', '25x25', 34.93, 48, NULL, NULL, 11, 52.90, NULL, true, 1, 0, 'Magenta', NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (29, 'LIS-001-20X20-MAGENT', '20x20', 27.93, 30, NULL, NULL, 11, 42.90, NULL, true, 1, 0, 'Magenta', NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (32, 'NAT-001-10X10', '10x10', 10.43, 12, NULL, NULL, 12, 16.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (33, 'NAT-001-15X15', '15x15', 13.23, 12, NULL, NULL, 12, 20.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (34, 'NAT-001-20X20', '20x20', 17.43, 18, NULL, NULL, 12, 28.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (35, 'NAT-001-25X25', '25x25', 20.93, 12, NULL, NULL, 12, 33.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (36, 'NAT-001-30X30', '30x30', 27.93, 12, NULL, NULL, 12, 46.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (37, 'NAT-001-40X40', '40x40', 48.93, 0, NULL, NULL, 12, 79.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (16, 'AMO-016', '20x20', 27.93, 24, NULL, NULL, 8, 42.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (17, 'AMO-017', '25x25', 34.93, 12, NULL, NULL, 8, 52.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (43, 'AMO-006-20X20-NEGRO', '20x20', 27.93, 12, NULL, NULL, 3, 42.90, NULL, true, 1, 0, 'Negro', NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (8, 'AMO-008', '15x15', 20.93, 36, NULL, NULL, 4, 30.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (41, 'NAT-002-GRA', 'Grande', 20.93, 42, NULL, NULL, 13, 34.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (31, 'LIS-001-30X30-MAGENT', '30x30', 41.93, 24, NULL, NULL, 11, 64.90, NULL, true, 1, 0, 'Magenta', NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (15, 'AMO-015', '25x25', 34.93, 12, NULL, NULL, 7, 52.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (42, 'NAT-002-JUM', 'Jumbo', 32.13, 2, NULL, NULL, 13, 52.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (44, 'AMO-006-25X25-NEGRO', '25x25', 34.93, 0, NULL, NULL, 3, 52.90, NULL, true, 1, 0, 'Negro', NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (14, 'AMO-014', '20x20', 27.93, 0, NULL, NULL, 7, 42.90, NULL, true, 1, 0, NULL, NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (45, 'LIS-002-20X20-ORO', '20x20', 27.93, 0, NULL, NULL, 14, 42.90, NULL, true, 1, 0, 'Oro', NULL);
INSERT INTO public.producto_variantes (varianteid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, productoid, preciounitario, precioofertaunitario, activo, piezasporpaquete, stock_minimo, color_nombre, color_hex) VALUES (46, 'LIS-002-20X20-PLATA', '20x20', 27.93, 0, NULL, NULL, 14, 42.90, NULL, true, 1, 0, 'Plata', NULL);


--
-- TOC entry 4829 (class 0 OID 25293)
-- Dependencies: 295
-- Data for Name: productos; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, sku_maestro, reglaid) VALUES (4, 2, 'Black', NULL, true, 1, 'AMO-008', 1);
INSERT INTO public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, sku_maestro, reglaid) VALUES (6, 2, 'Colores', NULL, true, 1, 'AMO-012', 1);
INSERT INTO public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, sku_maestro, reglaid) VALUES (1, 2, 'Colors Love Cubo', NULL, true, 1, 'AMO-001', 1);
INSERT INTO public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, sku_maestro, reglaid) VALUES (5, 2, 'Craft', NULL, true, 1, 'AMO-010', 1);
INSERT INTO public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, sku_maestro, reglaid) VALUES (8, 2, 'Hecho en México', NULL, true, 1, 'AMO-016', 1);
INSERT INTO public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, sku_maestro, reglaid) VALUES (2, 2, 'LV Oro', NULL, true, 1, 'AMO-003', 1);
INSERT INTO public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, sku_maestro, reglaid) VALUES (7, 2, 'RedBlack', NULL, true, 1, 'AMO-014', 1);
INSERT INTO public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, sku_maestro, reglaid) VALUES (9, 2, 'Cubo Acetato', 'Cubo Acetato', true, 1, 'AMO-018', 1);
INSERT INTO public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, sku_maestro, reglaid) VALUES (11, 1, 'Cubo Liso', NULL, true, 1, 'LIS-001', 2);
INSERT INTO public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, sku_maestro, reglaid) VALUES (3, 1, 'Brillo', NULL, true, 1, 'AMO-006', 1);
INSERT INTO public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, sku_maestro, reglaid) VALUES (12, 4, 'Cubo Natural', NULL, true, 1, 'NAT-001', 2);
INSERT INTO public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, sku_maestro, reglaid) VALUES (13, 4, 'Camisera Natural', NULL, true, 1, 'NAT-002', 1);
INSERT INTO public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, sku_maestro, reglaid) VALUES (10, 2, 'Libreta', NULL, true, 1, 'AMO-019', 5);
INSERT INTO public.productos (productoid, categoriaid, nombreproducto, descripcion, activo, proveedorid_default, sku_maestro, reglaid) VALUES (14, 1, 'Línea Metalizada', NULL, true, 1, 'LIS-002', 1);


--
-- TOC entry 4831 (class 0 OID 25300)
-- Dependencies: 297
-- Data for Name: proveedor_reglas_empaque; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.proveedor_reglas_empaque (reglaid, proveedorid, tipoproductoid, cantidadempaque, descripcion, nombre_regla) VALUES (3, 3, 1, 12, 'Caja (12)', NULL);
INSERT INTO public.proveedor_reglas_empaque (reglaid, proveedorid, tipoproductoid, cantidadempaque, descripcion, nombre_regla) VALUES (4, 3, 1, 10, 'Caja (10)', NULL);
INSERT INTO public.proveedor_reglas_empaque (reglaid, proveedorid, tipoproductoid, cantidadempaque, descripcion, nombre_regla) VALUES (2, 1, 1, 6, 'Caja (6)', NULL);
INSERT INTO public.proveedor_reglas_empaque (reglaid, proveedorid, tipoproductoid, cantidadempaque, descripcion, nombre_regla) VALUES (1, 1, 1, 12, 'Caja (12)', NULL);
INSERT INTO public.proveedor_reglas_empaque (reglaid, proveedorid, tipoproductoid, cantidadempaque, descripcion, nombre_regla) VALUES (5, 1, 4, 6, 'Libretas (6)', NULL);


--
-- TOC entry 4833 (class 0 OID 25305)
-- Dependencies: 299
-- Data for Name: proveedores; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.proveedores (proveedorid, nombreempresa, contactonombre, email, telefono, razonsocial, rfc, regimenfiscal, calle, colonia, codigopostal, ciudad, estado, nombrerepresentanteventas, celularventas, emailventas, nombrecontactocobranza, telefonocobranza, emailcobranza, banco, numerocuenta, clabe, referenciapago, diascredito, limitecredito, descuentofinanciero, minimocompra, aceptadevoluciones) VALUES (1, 'Fashion', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false);
INSERT INTO public.proveedores (proveedorid, nombreempresa, contactonombre, email, telefono, razonsocial, rfc, regimenfiscal, calle, colonia, codigopostal, ciudad, estado, nombrerepresentanteventas, celularventas, emailventas, nombrecontactocobranza, telefonocobranza, emailcobranza, banco, numerocuenta, clabe, referenciapago, diascredito, limitecredito, descuentofinanciero, minimocompra, aceptadevoluciones) VALUES (3, 'ExploWorld', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false);


--
-- TOC entry 4835 (class 0 OID 25311)
-- Dependencies: 301
-- Data for Name: solicitudes_credito; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.solicitudes_credito (solicitud_id, cliente_id, monto_solicitado, motivo_uso, estado, fecha_solicitud, comentarios_admin) VALUES (1, 2, 5000.00, 'prueba', 'APROBADO', '2025-12-24 17:24:00.197026', NULL);
INSERT INTO public.solicitudes_credito (solicitud_id, cliente_id, monto_solicitado, motivo_uso, estado, fecha_solicitud, comentarios_admin) VALUES (2, 1, 20000.00, 'pruebas', 'APROBADO', '2025-12-26 16:57:41.701303', NULL);


--
-- TOC entry 4837 (class 0 OID 25319)
-- Dependencies: 303
-- Data for Name: tipoproducto; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.tipoproducto (tipoproductoid, nombre, descripcion, activo, fechacreacion) VALUES (1, 'Caja', NULL, true, '2025-12-11 19:06:19.742054');
INSERT INTO public.tipoproducto (tipoproductoid, nombre, descripcion, activo, fechacreacion) VALUES (2, 'Peluche', NULL, true, '2025-12-12 11:10:10.356383');
INSERT INTO public.tipoproducto (tipoproductoid, nombre, descripcion, activo, fechacreacion) VALUES (3, 'Bolsa', NULL, true, '2025-12-12 18:54:55.894453');
INSERT INTO public.tipoproducto (tipoproductoid, nombre, descripcion, activo, fechacreacion) VALUES (4, 'Cuadernos', NULL, true, '2025-12-12 18:57:10.106707');


--
-- TOC entry 4839 (class 0 OID 25327)
-- Dependencies: 305
-- Data for Name: toma_inventario_conteos; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.toma_inventario_conteos (conteoid, sesionid, varianteid, conteo_a, usuario_a_id, conteo_b, usuario_b_id, cantidad_final, estatus_fila, estatus_aplicacion) VALUES (1, 1, 29, 18, 2, 16, 1, NULL, 'CONFLICTO', 'NO_APLICADO');
INSERT INTO public.toma_inventario_conteos (conteoid, sesionid, varianteid, conteo_a, usuario_a_id, conteo_b, usuario_b_id, cantidad_final, estatus_fila, estatus_aplicacion) VALUES (2, 1, 30, 36, 2, 36, 1, 36, 'VALIDADO', 'APLICADO');
INSERT INTO public.toma_inventario_conteos (conteoid, sesionid, varianteid, conteo_a, usuario_a_id, conteo_b, usuario_b_id, cantidad_final, estatus_fila, estatus_aplicacion) VALUES (3, 1, 43, 12, 2, 12, 1, 12, 'VALIDADO', 'APLICADO');
INSERT INTO public.toma_inventario_conteos (conteoid, sesionid, varianteid, conteo_a, usuario_a_id, conteo_b, usuario_b_id, cantidad_final, estatus_fila, estatus_aplicacion) VALUES (4, 1, 44, 24, 2, 22, 1, NULL, 'CONFLICTO', 'NO_APLICADO');
INSERT INTO public.toma_inventario_conteos (conteoid, sesionid, varianteid, conteo_a, usuario_a_id, conteo_b, usuario_b_id, cantidad_final, estatus_fila, estatus_aplicacion) VALUES (5, 1, 34, 6, 2, 6, 1, 6, 'VALIDADO', 'APLICADO');
INSERT INTO public.toma_inventario_conteos (conteoid, sesionid, varianteid, conteo_a, usuario_a_id, conteo_b, usuario_b_id, cantidad_final, estatus_fila, estatus_aplicacion) VALUES (6, 1, 41, 18, 2, 18, 1, 18, 'VALIDADO', 'APLICADO');
INSERT INTO public.toma_inventario_conteos (conteoid, sesionid, varianteid, conteo_a, usuario_a_id, conteo_b, usuario_b_id, cantidad_final, estatus_fila, estatus_aplicacion) VALUES (7, 1, 42, 14, 2, 12, 1, NULL, 'CONFLICTO', 'NO_APLICADO');
INSERT INTO public.toma_inventario_conteos (conteoid, sesionid, varianteid, conteo_a, usuario_a_id, conteo_b, usuario_b_id, cantidad_final, estatus_fila, estatus_aplicacion) VALUES (8, 2, 29, 18, 2, 18, 1, 18, 'VALIDADO', 'APLICADO');
INSERT INTO public.toma_inventario_conteos (conteoid, sesionid, varianteid, conteo_a, usuario_a_id, conteo_b, usuario_b_id, cantidad_final, estatus_fila, estatus_aplicacion) VALUES (9, 2, 44, 24, 2, 24, 1, 24, 'VALIDADO', 'APLICADO');
INSERT INTO public.toma_inventario_conteos (conteoid, sesionid, varianteid, conteo_a, usuario_a_id, conteo_b, usuario_b_id, cantidad_final, estatus_fila, estatus_aplicacion) VALUES (10, 2, 42, 14, 2, 14, 1, 14, 'VALIDADO', 'APLICADO');


--
-- TOC entry 4841 (class 0 OID 25334)
-- Dependencies: 307
-- Data for Name: toma_inventario_sesiones; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.toma_inventario_sesiones (sesionid, nombre, fechainicio, fechacierre, estatus, usuario_creador_id) VALUES (1, 'Inv 26-dic', '2025-12-26 15:14:54.21321', NULL, 'APLICADA_PARCIAL', 2);
INSERT INTO public.toma_inventario_sesiones (sesionid, nombre, fechainicio, fechacierre, estatus, usuario_creador_id) VALUES (2, 'Corrección Inv 26-dic', '2025-12-26 16:22:38.629212', NULL, 'APLICADA', 2);


--
-- TOC entry 4999 (class 0 OID 0)
-- Dependencies: 221
-- Name: jobid_seq; Type: SEQUENCE SET; Schema: cron; Owner: azuresu
--

SELECT pg_catalog.setval('cron.jobid_seq', 1, false);


--
-- TOC entry 5000 (class 0 OID 0)
-- Dependencies: 223
-- Name: runid_seq; Type: SEQUENCE SET; Schema: cron; Owner: azuresu
--

SELECT pg_catalog.setval('cron.runid_seq', 1, false);


--
-- TOC entry 5001 (class 0 OID 0)
-- Dependencies: 226
-- Name: administradores_adminid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.administradores_adminid_seq', 3, true);


--
-- TOC entry 5002 (class 0 OID 0)
-- Dependencies: 228
-- Name: agentesdeventas_agenteid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.agentesdeventas_agenteid_seq', 1, true);


--
-- TOC entry 5003 (class 0 OID 0)
-- Dependencies: 230
-- Name: carritodecompra_carritoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.carritodecompra_carritoid_seq', 3, true);


--
-- TOC entry 5004 (class 0 OID 0)
-- Dependencies: 232
-- Name: cat_cxp_etiquetas_etiqueta_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cat_cxp_etiquetas_etiqueta_id_seq', 1, false);


--
-- TOC entry 5005 (class 0 OID 0)
-- Dependencies: 234
-- Name: cat_tamanopaquetes_tamanoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cat_tamanopaquetes_tamanoid_seq', 5, true);


--
-- TOC entry 5006 (class 0 OID 0)
-- Dependencies: 236
-- Name: categorias_categoriaid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.categorias_categoriaid_seq', 4, true);


--
-- TOC entry 5007 (class 0 OID 0)
-- Dependencies: 238
-- Name: cliente_creditos_credito_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cliente_creditos_credito_id_seq', 2, true);


--
-- TOC entry 5008 (class 0 OID 0)
-- Dependencies: 240
-- Name: cliente_direcciones_direccionid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cliente_direcciones_direccionid_seq', 2, true);


--
-- TOC entry 5009 (class 0 OID 0)
-- Dependencies: 242
-- Name: clientes_clienteid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.clientes_clienteid_seq', 3, true);


--
-- TOC entry 5010 (class 0 OID 0)
-- Dependencies: 244
-- Name: comisiones_comisionid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.comisiones_comisionid_seq', 1, false);


--
-- TOC entry 5011 (class 0 OID 0)
-- Dependencies: 246
-- Name: communicationlogs_logid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.communicationlogs_logid_seq', 38, true);


--
-- TOC entry 5012 (class 0 OID 0)
-- Dependencies: 248
-- Name: control_cambios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.control_cambios_id_seq', 42, true);


--
-- TOC entry 5013 (class 0 OID 0)
-- Dependencies: 250
-- Name: credito_movimientos_movimiento_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.credito_movimientos_movimiento_id_seq', 18, true);


--
-- TOC entry 5014 (class 0 OID 0)
-- Dependencies: 252
-- Name: cuentas_por_cobrar_cxcid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cuentas_por_cobrar_cxcid_seq', 1, false);


--
-- TOC entry 5015 (class 0 OID 0)
-- Dependencies: 254
-- Name: cuentas_por_pagar_cxp_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cuentas_por_pagar_cxp_id_seq', 4, true);


--
-- TOC entry 5016 (class 0 OID 0)
-- Dependencies: 312
-- Name: cupones_cuponid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cupones_cuponid_seq', 1, false);


--
-- TOC entry 5017 (class 0 OID 0)
-- Dependencies: 256
-- Name: cxp_etiquetas_asignadas_asignacion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cxp_etiquetas_asignadas_asignacion_id_seq', 1, false);


--
-- TOC entry 5018 (class 0 OID 0)
-- Dependencies: 258
-- Name: datos_bancarios_empresa_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.datos_bancarios_empresa_id_seq', 2, true);


--
-- TOC entry 5019 (class 0 OID 0)
-- Dependencies: 260
-- Name: detallesdelpedido_detalleid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.detallesdelpedido_detalleid_seq', 19, true);


--
-- TOC entry 5020 (class 0 OID 0)
-- Dependencies: 262
-- Name: detallesordencompra_detalleoc_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.detallesordencompra_detalleoc_id_seq', 40, true);


--
-- TOC entry 5021 (class 0 OID 0)
-- Dependencies: 266
-- Name: estados_estadoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.estados_estadoid_seq', 32, true);


--
-- TOC entry 5022 (class 0 OID 0)
-- Dependencies: 268
-- Name: itemsdelcarrito_itemid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.itemsdelcarrito_itemid_seq', 23, true);


--
-- TOC entry 5023 (class 0 OID 0)
-- Dependencies: 270
-- Name: log_eventosusuario_eventoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.log_eventosusuario_eventoid_seq', 1, false);


--
-- TOC entry 5024 (class 0 OID 0)
-- Dependencies: 272
-- Name: log_inventario_logid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.log_inventario_logid_seq', 30, true);


--
-- TOC entry 5025 (class 0 OID 0)
-- Dependencies: 274
-- Name: log_movimientos_logid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.log_movimientos_logid_seq', 102, true);


--
-- TOC entry 5026 (class 0 OID 0)
-- Dependencies: 276
-- Name: medidas_medidaid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.medidas_medidaid_seq', 1, false);


--
-- TOC entry 5027 (class 0 OID 0)
-- Dependencies: 277
-- Name: notificaciones_notificacionid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.notificaciones_notificacionid_seq', 46, true);


--
-- TOC entry 5028 (class 0 OID 0)
-- Dependencies: 279
-- Name: ordenesdecompra_ordencompraid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.ordenesdecompra_ordencompraid_seq', 8, true);


--
-- TOC entry 5029 (class 0 OID 0)
-- Dependencies: 281
-- Name: pagos_clientes_pago_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.pagos_clientes_pago_id_seq', 6, true);


--
-- TOC entry 5030 (class 0 OID 0)
-- Dependencies: 283
-- Name: pagos_cxp_pago_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.pagos_cxp_pago_id_seq', 2, true);


--
-- TOC entry 5031 (class 0 OID 0)
-- Dependencies: 285
-- Name: passwordresettokens_tokenid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.passwordresettokens_tokenid_seq', 1, false);


--
-- TOC entry 5032 (class 0 OID 0)
-- Dependencies: 287
-- Name: pedidos_pedidoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.pedidos_pedidoid_seq', 12, true);


--
-- TOC entry 5033 (class 0 OID 0)
-- Dependencies: 310
-- Name: producto_imagenes_color_imagencolorid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.producto_imagenes_color_imagencolorid_seq', 1, false);


--
-- TOC entry 5034 (class 0 OID 0)
-- Dependencies: 289
-- Name: producto_imagenes_imagenid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.producto_imagenes_imagenid_seq', 47, true);


--
-- TOC entry 5035 (class 0 OID 0)
-- Dependencies: 292
-- Name: producto_variante_imagenes_imagenid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.producto_variante_imagenes_imagenid_seq', 11, true);


--
-- TOC entry 5036 (class 0 OID 0)
-- Dependencies: 294
-- Name: producto_variantes_varianteid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.producto_variantes_varianteid_seq', 46, true);


--
-- TOC entry 5037 (class 0 OID 0)
-- Dependencies: 296
-- Name: productos_productoid_seq1; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.productos_productoid_seq1', 14, true);


--
-- TOC entry 5038 (class 0 OID 0)
-- Dependencies: 298
-- Name: proveedor_reglas_empaque_reglaid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.proveedor_reglas_empaque_reglaid_seq', 5, true);


--
-- TOC entry 5039 (class 0 OID 0)
-- Dependencies: 300
-- Name: proveedores_proveedorid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.proveedores_proveedorid_seq', 3, true);


--
-- TOC entry 5040 (class 0 OID 0)
-- Dependencies: 302
-- Name: solicitudes_credito_solicitud_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.solicitudes_credito_solicitud_id_seq', 2, true);


--
-- TOC entry 5041 (class 0 OID 0)
-- Dependencies: 304
-- Name: tipoproducto_tipoproductoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.tipoproducto_tipoproductoid_seq', 4, true);


--
-- TOC entry 5042 (class 0 OID 0)
-- Dependencies: 306
-- Name: toma_inventario_conteos_conteoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.toma_inventario_conteos_conteoid_seq', 10, true);


--
-- TOC entry 5043 (class 0 OID 0)
-- Dependencies: 308
-- Name: toma_inventario_sesiones_sesionid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.toma_inventario_sesiones_sesionid_seq', 2, true);


--
-- TOC entry 4376 (class 2606 OID 25387)
-- Name: administradores administradores_email_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.administradores
    ADD CONSTRAINT administradores_email_key UNIQUE (email);


--
-- TOC entry 4378 (class 2606 OID 25389)
-- Name: administradores administradores_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.administradores
    ADD CONSTRAINT administradores_pkey PRIMARY KEY (adminid);


--
-- TOC entry 4380 (class 2606 OID 25391)
-- Name: agentesdeventas agentesdeventas_codigoagente_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.agentesdeventas
    ADD CONSTRAINT agentesdeventas_codigoagente_key UNIQUE (codigoagente);


--
-- TOC entry 4382 (class 2606 OID 25393)
-- Name: agentesdeventas agentesdeventas_email_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.agentesdeventas
    ADD CONSTRAINT agentesdeventas_email_key UNIQUE (email);


--
-- TOC entry 4384 (class 2606 OID 25395)
-- Name: agentesdeventas agentesdeventas_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.agentesdeventas
    ADD CONSTRAINT agentesdeventas_pkey PRIMARY KEY (agenteid);


--
-- TOC entry 4386 (class 2606 OID 25397)
-- Name: carritodecompra carritodecompra_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.carritodecompra
    ADD CONSTRAINT carritodecompra_pkey PRIMARY KEY (carritoid);


--
-- TOC entry 4388 (class 2606 OID 25399)
-- Name: cat_cxp_etiquetas cat_cxp_etiquetas_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_cxp_etiquetas
    ADD CONSTRAINT cat_cxp_etiquetas_pkey PRIMARY KEY (etiqueta_id);


--
-- TOC entry 4390 (class 2606 OID 25401)
-- Name: cat_tamanopaquetes cat_tamanopaquetes_cantidad_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_tamanopaquetes
    ADD CONSTRAINT cat_tamanopaquetes_cantidad_key UNIQUE (cantidad);


--
-- TOC entry 4392 (class 2606 OID 25403)
-- Name: cat_tamanopaquetes cat_tamanopaquetes_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_tamanopaquetes
    ADD CONSTRAINT cat_tamanopaquetes_pkey PRIMARY KEY (tamanoid);


--
-- TOC entry 4394 (class 2606 OID 25405)
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (categoriaid);


--
-- TOC entry 4397 (class 2606 OID 25407)
-- Name: cliente_creditos cliente_creditos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_creditos
    ADD CONSTRAINT cliente_creditos_pkey PRIMARY KEY (credito_id);


--
-- TOC entry 4402 (class 2606 OID 25409)
-- Name: cliente_direcciones cliente_direcciones_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_direcciones
    ADD CONSTRAINT cliente_direcciones_pkey PRIMARY KEY (direccionid);


--
-- TOC entry 4404 (class 2606 OID 25411)
-- Name: clientes clientes_email_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_email_key UNIQUE (email);


--
-- TOC entry 4406 (class 2606 OID 25413)
-- Name: clientes clientes_google_id_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_google_id_key UNIQUE (google_id);


--
-- TOC entry 4408 (class 2606 OID 25415)
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (clienteid);


--
-- TOC entry 4411 (class 2606 OID 25417)
-- Name: comisiones comisiones_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_pkey PRIMARY KEY (comisionid);


--
-- TOC entry 4413 (class 2606 OID 25419)
-- Name: communicationlogs communicationlogs_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT communicationlogs_pkey PRIMARY KEY (logid);


--
-- TOC entry 4415 (class 2606 OID 25421)
-- Name: control_cambios control_cambios_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.control_cambios
    ADD CONSTRAINT control_cambios_pkey PRIMARY KEY (id);


--
-- TOC entry 4419 (class 2606 OID 25423)
-- Name: credito_movimientos credito_movimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.credito_movimientos
    ADD CONSTRAINT credito_movimientos_pkey PRIMARY KEY (movimiento_id);


--
-- TOC entry 4421 (class 2606 OID 25425)
-- Name: cuentas_por_cobrar cuentas_por_cobrar_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_cobrar
    ADD CONSTRAINT cuentas_por_cobrar_pkey PRIMARY KEY (cxcid);


--
-- TOC entry 4423 (class 2606 OID 25427)
-- Name: cuentas_por_pagar cuentas_por_pagar_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT cuentas_por_pagar_pkey PRIMARY KEY (cxp_id);


--
-- TOC entry 4540 (class 2606 OID 25907)
-- Name: cupones cupones_codigo_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cupones
    ADD CONSTRAINT cupones_codigo_key UNIQUE (codigo);


--
-- TOC entry 4542 (class 2606 OID 25905)
-- Name: cupones cupones_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cupones
    ADD CONSTRAINT cupones_pkey PRIMARY KEY (cuponid);


--
-- TOC entry 4432 (class 2606 OID 25429)
-- Name: cxp_etiquetas_asignadas cxp_etiquetas_asignadas_cxp_id_etiqueta_id_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cxp_etiquetas_asignadas
    ADD CONSTRAINT cxp_etiquetas_asignadas_cxp_id_etiqueta_id_key UNIQUE (cxp_id, etiqueta_id);


--
-- TOC entry 4434 (class 2606 OID 25431)
-- Name: cxp_etiquetas_asignadas cxp_etiquetas_asignadas_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cxp_etiquetas_asignadas
    ADD CONSTRAINT cxp_etiquetas_asignadas_pkey PRIMARY KEY (asignacion_id);


--
-- TOC entry 4436 (class 2606 OID 25433)
-- Name: datos_bancarios_empresa datos_bancarios_empresa_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.datos_bancarios_empresa
    ADD CONSTRAINT datos_bancarios_empresa_pkey PRIMARY KEY (id);


--
-- TOC entry 4439 (class 2606 OID 25435)
-- Name: detallesdelpedido detallesdelpedido_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT detallesdelpedido_pkey PRIMARY KEY (detalleid);


--
-- TOC entry 4441 (class 2606 OID 25437)
-- Name: detallesordencompra detallesordencompra_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra
    ADD CONSTRAINT detallesordencompra_pkey PRIMARY KEY (detalleoc_id);


--
-- TOC entry 4449 (class 2606 OID 25439)
-- Name: estados estados_abreviatura_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados
    ADD CONSTRAINT estados_abreviatura_key UNIQUE (abreviatura);


--
-- TOC entry 4451 (class 2606 OID 25441)
-- Name: estados estados_nombre_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados
    ADD CONSTRAINT estados_nombre_key UNIQUE (nombre);


--
-- TOC entry 4453 (class 2606 OID 25443)
-- Name: estados estados_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados
    ADD CONSTRAINT estados_pkey PRIMARY KEY (estadoid);


--
-- TOC entry 4455 (class 2606 OID 25445)
-- Name: itemsdelcarrito itemsdelcarrito_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT itemsdelcarrito_pkey PRIMARY KEY (itemid);


--
-- TOC entry 4461 (class 2606 OID 25447)
-- Name: log_eventosusuario log_eventosusuario_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario
    ADD CONSTRAINT log_eventosusuario_pkey PRIMARY KEY (eventoid);


--
-- TOC entry 4466 (class 2606 OID 25449)
-- Name: log_inventario log_inventario_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_inventario
    ADD CONSTRAINT log_inventario_pkey PRIMARY KEY (logid);


--
-- TOC entry 4472 (class 2606 OID 25451)
-- Name: log_movimientos log_movimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_movimientos
    ADD CONSTRAINT log_movimientos_pkey PRIMARY KEY (logid);


--
-- TOC entry 4475 (class 2606 OID 25453)
-- Name: medidas medidas_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas
    ADD CONSTRAINT medidas_pkey PRIMARY KEY (medidaid);


--
-- TOC entry 4477 (class 2606 OID 25455)
-- Name: medidas medidas_tipoproductoid_nombremedida_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas
    ADD CONSTRAINT medidas_tipoproductoid_nombremedida_key UNIQUE (tipoproductoid, nombremedida);


--
-- TOC entry 4447 (class 2606 OID 25457)
-- Name: notificaciones notificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_pkey PRIMARY KEY (notificacionid);


--
-- TOC entry 4481 (class 2606 OID 25459)
-- Name: ordenesdecompra ordenesdecompra_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.ordenesdecompra
    ADD CONSTRAINT ordenesdecompra_pkey PRIMARY KEY (ordencompraid);


--
-- TOC entry 4487 (class 2606 OID 25461)
-- Name: pagos_clientes pagos_clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_clientes
    ADD CONSTRAINT pagos_clientes_pkey PRIMARY KEY (pago_id);


--
-- TOC entry 4490 (class 2606 OID 25463)
-- Name: pagos_cxp pagos_cxp_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_cxp
    ADD CONSTRAINT pagos_cxp_pkey PRIMARY KEY (pago_id);


--
-- TOC entry 4492 (class 2606 OID 25465)
-- Name: passwordresettokens passwordresettokens_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT passwordresettokens_pkey PRIMARY KEY (tokenid);


--
-- TOC entry 4494 (class 2606 OID 25467)
-- Name: passwordresettokens passwordresettokens_token_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT passwordresettokens_token_key UNIQUE (token);


--
-- TOC entry 4496 (class 2606 OID 25469)
-- Name: pedidos pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_pkey PRIMARY KEY (pedidoid);


--
-- TOC entry 4538 (class 2606 OID 25885)
-- Name: producto_imagenes_color producto_imagenes_color_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_imagenes_color
    ADD CONSTRAINT producto_imagenes_color_pkey PRIMARY KEY (imagencolorid);


--
-- TOC entry 4498 (class 2606 OID 25471)
-- Name: producto_imagenes producto_imagenes_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_imagenes
    ADD CONSTRAINT producto_imagenes_pkey PRIMARY KEY (imagenid);


--
-- TOC entry 4500 (class 2606 OID 25473)
-- Name: producto_tamanosdisponibles producto_tamanosdisponibles_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_tamanosdisponibles
    ADD CONSTRAINT producto_tamanosdisponibles_pkey PRIMARY KEY (productoid, tamanoid);


--
-- TOC entry 4504 (class 2606 OID 25475)
-- Name: producto_variante_imagenes producto_variante_imagenes_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variante_imagenes
    ADD CONSTRAINT producto_variante_imagenes_pkey PRIMARY KEY (imagenid);


--
-- TOC entry 4509 (class 2606 OID 25477)
-- Name: producto_variantes productos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_pkey PRIMARY KEY (varianteid);


--
-- TOC entry 4514 (class 2606 OID 25479)
-- Name: productos productos_pkey1; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey1 PRIMARY KEY (productoid);


--
-- TOC entry 4511 (class 2606 OID 25481)
-- Name: producto_variantes productos_sku_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_sku_key UNIQUE (sku);


--
-- TOC entry 4516 (class 2606 OID 25483)
-- Name: productos productos_sku_maestro_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_sku_maestro_key UNIQUE (sku_maestro);


--
-- TOC entry 4518 (class 2606 OID 25485)
-- Name: proveedor_reglas_empaque proveedor_reglas_empaque_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedor_reglas_empaque
    ADD CONSTRAINT proveedor_reglas_empaque_pkey PRIMARY KEY (reglaid);


--
-- TOC entry 4520 (class 2606 OID 25487)
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (proveedorid);


--
-- TOC entry 4522 (class 2606 OID 25489)
-- Name: solicitudes_credito solicitudes_credito_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.solicitudes_credito
    ADD CONSTRAINT solicitudes_credito_pkey PRIMARY KEY (solicitud_id);


--
-- TOC entry 4524 (class 2606 OID 25491)
-- Name: tipoproducto tipoproducto_nombre_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.tipoproducto
    ADD CONSTRAINT tipoproducto_nombre_key UNIQUE (nombre);


--
-- TOC entry 4526 (class 2606 OID 25493)
-- Name: tipoproducto tipoproducto_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.tipoproducto
    ADD CONSTRAINT tipoproducto_pkey PRIMARY KEY (tipoproductoid);


--
-- TOC entry 4531 (class 2606 OID 25495)
-- Name: toma_inventario_conteos toma_inventario_conteos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_conteos
    ADD CONSTRAINT toma_inventario_conteos_pkey PRIMARY KEY (conteoid);


--
-- TOC entry 4535 (class 2606 OID 25497)
-- Name: toma_inventario_sesiones toma_inventario_sesiones_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_sesiones
    ADD CONSTRAINT toma_inventario_sesiones_pkey PRIMARY KEY (sesionid);


--
-- TOC entry 4400 (class 2606 OID 25499)
-- Name: cliente_creditos unique_cliente_credito; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_creditos
    ADD CONSTRAINT unique_cliente_credito UNIQUE (cliente_id);


--
-- TOC entry 4430 (class 2606 OID 25501)
-- Name: cuentas_por_pagar unq_orden_referencia; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT unq_orden_referencia UNIQUE (orden_compra_id, referencia_factura);


--
-- TOC entry 4533 (class 2606 OID 25503)
-- Name: toma_inventario_conteos unq_sesion_variante; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_conteos
    ADD CONSTRAINT unq_sesion_variante UNIQUE (sesionid, varianteid);


--
-- TOC entry 4395 (class 1259 OID 25504)
-- Name: idx_categoria_activo; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_categoria_activo ON public.categorias USING btree (activo);


--
-- TOC entry 4409 (class 1259 OID 25505)
-- Name: idx_cliente_agente; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cliente_agente ON public.clientes USING btree (agenteid);


--
-- TOC entry 4398 (class 1259 OID 25506)
-- Name: idx_cliente_creditos_exportacion; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cliente_creditos_exportacion ON public.cliente_creditos USING btree (exportado_en) WHERE (exportado_en IS NULL);


--
-- TOC entry 4527 (class 1259 OID 25507)
-- Name: idx_conteos_estatus; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_conteos_estatus ON public.toma_inventario_conteos USING btree (estatus_fila);


--
-- TOC entry 4528 (class 1259 OID 25508)
-- Name: idx_conteos_estatus_aplicacion; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_conteos_estatus_aplicacion ON public.toma_inventario_conteos USING btree (estatus_aplicacion);


--
-- TOC entry 4529 (class 1259 OID 25509)
-- Name: idx_conteos_sesion; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_conteos_sesion ON public.toma_inventario_conteos USING btree (sesionid);


--
-- TOC entry 4416 (class 1259 OID 25510)
-- Name: idx_control_cambios_entidad; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_control_cambios_entidad ON public.control_cambios USING btree (entidad, entidad_id);


--
-- TOC entry 4417 (class 1259 OID 25511)
-- Name: idx_control_cambios_estado; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_control_cambios_estado ON public.control_cambios USING btree (estado);


--
-- TOC entry 4424 (class 1259 OID 25512)
-- Name: idx_cxp_estatus; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cxp_estatus ON public.cuentas_por_pagar USING btree (estatus);


--
-- TOC entry 4425 (class 1259 OID 25513)
-- Name: idx_cxp_exportacion; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cxp_exportacion ON public.cuentas_por_pagar USING btree (exportado_en) WHERE (exportado_en IS NULL);


--
-- TOC entry 4426 (class 1259 OID 25514)
-- Name: idx_cxp_fecha_cierre; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cxp_fecha_cierre ON public.cuentas_por_pagar USING btree (fecha_cierre);


--
-- TOC entry 4427 (class 1259 OID 25515)
-- Name: idx_cxp_proveedor; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cxp_proveedor ON public.cuentas_por_pagar USING btree (proveedor_id);


--
-- TOC entry 4428 (class 1259 OID 25516)
-- Name: idx_cxp_vencimiento; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cxp_vencimiento ON public.cuentas_por_pagar USING btree (fecha_vencimiento);


--
-- TOC entry 4437 (class 1259 OID 25517)
-- Name: idx_datos_bancarios_principal; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_datos_bancarios_principal ON public.datos_bancarios_empresa USING btree (es_principal) WHERE (es_principal = true);


--
-- TOC entry 4467 (class 1259 OID 25518)
-- Name: idx_log_accion; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_accion ON public.log_movimientos USING btree (accion);


--
-- TOC entry 4456 (class 1259 OID 25519)
-- Name: idx_log_clienteid; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_clienteid ON public.log_eventosusuario USING btree (clienteid);


--
-- TOC entry 4468 (class 1259 OID 25520)
-- Name: idx_log_entidad; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_entidad ON public.log_movimientos USING btree (entidad, entidadid);


--
-- TOC entry 4469 (class 1259 OID 25521)
-- Name: idx_log_fecha; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_fecha ON public.log_movimientos USING btree (fecha DESC);


--
-- TOC entry 4462 (class 1259 OID 25522)
-- Name: idx_log_inventario_cxp; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_inventario_cxp ON public.log_inventario USING btree (cxp_id);


--
-- TOC entry 4463 (class 1259 OID 25523)
-- Name: idx_log_inventario_cxp_id; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_inventario_cxp_id ON public.log_inventario USING btree (cxp_id);


--
-- TOC entry 4464 (class 1259 OID 25524)
-- Name: idx_log_inventario_excepcion; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_inventario_excepcion ON public.log_inventario USING btree (es_excepcion);


--
-- TOC entry 4457 (class 1259 OID 25525)
-- Name: idx_log_timestamp; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_timestamp ON public.log_eventosusuario USING btree ("timestamp");


--
-- TOC entry 4458 (class 1259 OID 25526)
-- Name: idx_log_tipoevento; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_tipoevento ON public.log_eventosusuario USING btree (tipoevento);


--
-- TOC entry 4470 (class 1259 OID 25527)
-- Name: idx_log_usuario; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_usuario ON public.log_movimientos USING btree (usuarioid);


--
-- TOC entry 4459 (class 1259 OID 25528)
-- Name: idx_log_varianteid; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_varianteid ON public.log_eventosusuario USING btree (varianteid);


--
-- TOC entry 4473 (class 1259 OID 25529)
-- Name: idx_medidas_tipoproducto; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_medidas_tipoproducto ON public.medidas USING btree (tipoproductoid);


--
-- TOC entry 4442 (class 1259 OID 25530)
-- Name: idx_notificaciones_clienteid; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_clienteid ON public.notificaciones USING btree (clienteid);


--
-- TOC entry 4443 (class 1259 OID 25531)
-- Name: idx_notificaciones_fecha; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_fecha ON public.notificaciones USING btree (fechacreacion DESC);


--
-- TOC entry 4444 (class 1259 OID 25532)
-- Name: idx_notificaciones_leida; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_leida ON public.notificaciones USING btree (leida);


--
-- TOC entry 4445 (class 1259 OID 25533)
-- Name: idx_notificaciones_tipo; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_tipo ON public.notificaciones USING btree (tipo);


--
-- TOC entry 4478 (class 1259 OID 25534)
-- Name: idx_ordenes_exportacion_pendientes; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_ordenes_exportacion_pendientes ON public.ordenesdecompra USING btree (exportado_en) WHERE (exportado_en IS NULL);


--
-- TOC entry 4479 (class 1259 OID 25535)
-- Name: idx_ordenesdecompra_origenoc; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_ordenesdecompra_origenoc ON public.ordenesdecompra USING btree (origenoc);


--
-- TOC entry 4482 (class 1259 OID 25536)
-- Name: idx_pagos_clientes_cliente; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_pagos_clientes_cliente ON public.pagos_clientes USING btree (cliente_id);


--
-- TOC entry 4483 (class 1259 OID 25537)
-- Name: idx_pagos_clientes_credito; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_pagos_clientes_credito ON public.pagos_clientes USING btree (credito_id);


--
-- TOC entry 4484 (class 1259 OID 25538)
-- Name: idx_pagos_clientes_estatus; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_pagos_clientes_estatus ON public.pagos_clientes USING btree (estatus);


--
-- TOC entry 4485 (class 1259 OID 25539)
-- Name: idx_pagos_clientes_fecha; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_pagos_clientes_fecha ON public.pagos_clientes USING btree (fecha_pago DESC);


--
-- TOC entry 4488 (class 1259 OID 25540)
-- Name: idx_pagos_historial; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_pagos_historial ON public.pagos_cxp USING btree (cxp_id);


--
-- TOC entry 4512 (class 1259 OID 25541)
-- Name: idx_producto_activo; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_producto_activo ON public.productos USING btree (activo);


--
-- TOC entry 4536 (class 1259 OID 25891)
-- Name: idx_producto_color_busqueda; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_producto_color_busqueda ON public.producto_imagenes_color USING btree (productoid, color_nombre);


--
-- TOC entry 4505 (class 1259 OID 25542)
-- Name: idx_producto_oferta; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_producto_oferta ON public.producto_variantes USING btree (precioofertaunitario) WHERE (precioofertaunitario IS NOT NULL);


--
-- TOC entry 4501 (class 1259 OID 25543)
-- Name: idx_producto_variante_imagenes_varianteid; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_producto_variante_imagenes_varianteid ON public.producto_variante_imagenes USING btree (varianteid);


--
-- TOC entry 4502 (class 1259 OID 25544)
-- Name: idx_producto_variante_imagenes_varianteid_orden; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_producto_variante_imagenes_varianteid_orden ON public.producto_variante_imagenes USING btree (varianteid, orden);


--
-- TOC entry 4506 (class 1259 OID 25545)
-- Name: idx_productos_tipoproducto; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_productos_tipoproducto ON public.producto_variantes USING btree (tipoproductoid);


--
-- TOC entry 4507 (class 1259 OID 25546)
-- Name: idx_variantes_color_nombre; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_variantes_color_nombre ON public.producto_variantes USING btree (color_nombre);


--
-- TOC entry 4612 (class 2620 OID 25547)
-- Name: notificaciones trigger_limitar_notificaciones; Type: TRIGGER; Schema: public; Owner: ferram
--

CREATE TRIGGER trigger_limitar_notificaciones AFTER INSERT ON public.notificaciones FOR EACH ROW EXECUTE FUNCTION public.limitar_notificaciones_por_cliente();


--
-- TOC entry 4611 (class 2620 OID 25548)
-- Name: cliente_creditos trigger_update_credito_fecha; Type: TRIGGER; Schema: public; Owner: ferram
--

CREATE TRIGGER trigger_update_credito_fecha BEFORE UPDATE ON public.cliente_creditos FOR EACH ROW EXECUTE FUNCTION public.update_ultima_actualizacion();


--
-- TOC entry 4543 (class 2606 OID 25549)
-- Name: carritodecompra carritodecompra_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.carritodecompra
    ADD CONSTRAINT carritodecompra_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 4544 (class 2606 OID 25554)
-- Name: categorias categorias_parentcategoriaid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_parentcategoriaid_fkey FOREIGN KEY (parentcategoriaid) REFERENCES public.categorias(categoriaid);


--
-- TOC entry 4546 (class 2606 OID 25559)
-- Name: cliente_direcciones cliente_direcciones_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_direcciones
    ADD CONSTRAINT cliente_direcciones_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 4549 (class 2606 OID 25564)
-- Name: comisiones comisiones_agenteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_agenteid_fkey FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid);


--
-- TOC entry 4550 (class 2606 OID 25569)
-- Name: comisiones comisiones_pedidoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_pedidoid_fkey FOREIGN KEY (pedidoid) REFERENCES public.pedidos(pedidoid);


--
-- TOC entry 4557 (class 2606 OID 25574)
-- Name: cuentas_por_cobrar cuentas_por_cobrar_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_cobrar
    ADD CONSTRAINT cuentas_por_cobrar_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(clienteid);


--
-- TOC entry 4558 (class 2606 OID 25579)
-- Name: cuentas_por_cobrar cuentas_por_cobrar_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_cobrar
    ADD CONSTRAINT cuentas_por_cobrar_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(pedidoid);


--
-- TOC entry 4559 (class 2606 OID 25584)
-- Name: cuentas_por_pagar cuentas_por_pagar_orden_compra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT cuentas_por_pagar_orden_compra_id_fkey FOREIGN KEY (orden_compra_id) REFERENCES public.ordenesdecompra(ordencompraid);


--
-- TOC entry 4560 (class 2606 OID 25589)
-- Name: cuentas_por_pagar cuentas_por_pagar_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT cuentas_por_pagar_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 4610 (class 2606 OID 25914)
-- Name: cupones cupones_agente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cupones
    ADD CONSTRAINT cupones_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.agentesdeventas(agenteid) ON DELETE SET NULL;


--
-- TOC entry 4561 (class 2606 OID 25594)
-- Name: cxp_etiquetas_asignadas cxp_etiquetas_asignadas_cxp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cxp_etiquetas_asignadas
    ADD CONSTRAINT cxp_etiquetas_asignadas_cxp_id_fkey FOREIGN KEY (cxp_id) REFERENCES public.cuentas_por_pagar(cxp_id) ON DELETE CASCADE;


--
-- TOC entry 4562 (class 2606 OID 25599)
-- Name: cxp_etiquetas_asignadas cxp_etiquetas_asignadas_etiqueta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cxp_etiquetas_asignadas
    ADD CONSTRAINT cxp_etiquetas_asignadas_etiqueta_id_fkey FOREIGN KEY (etiqueta_id) REFERENCES public.cat_cxp_etiquetas(etiqueta_id);


--
-- TOC entry 4563 (class 2606 OID 25604)
-- Name: detallesdelpedido detallesdelpedido_pedidoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT detallesdelpedido_pedidoid_fkey FOREIGN KEY (pedidoid) REFERENCES public.pedidos(pedidoid);


--
-- TOC entry 4566 (class 2606 OID 25609)
-- Name: detallesordencompra detallesordencompra_ordencompraid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra
    ADD CONSTRAINT detallesordencompra_ordencompraid_fkey FOREIGN KEY (ordencompraid) REFERENCES public.ordenesdecompra(ordencompraid);


--
-- TOC entry 4554 (class 2606 OID 25614)
-- Name: credito_movimientos fk_admin_registro; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.credito_movimientos
    ADD CONSTRAINT fk_admin_registro FOREIGN KEY (admin_id) REFERENCES public.administradores(adminid) ON DELETE SET NULL;


--
-- TOC entry 4555 (class 2606 OID 25619)
-- Name: credito_movimientos fk_agente_registro; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.credito_movimientos
    ADD CONSTRAINT fk_agente_registro FOREIGN KEY (agente_id) REFERENCES public.agentesdeventas(agenteid) ON DELETE SET NULL;


--
-- TOC entry 4551 (class 2606 OID 25624)
-- Name: communicationlogs fk_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT fk_cliente FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 4548 (class 2606 OID 25629)
-- Name: clientes fk_cliente_agente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT fk_cliente_agente FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid);


--
-- TOC entry 4545 (class 2606 OID 25634)
-- Name: cliente_creditos fk_cliente_credito; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_creditos
    ADD CONSTRAINT fk_cliente_credito FOREIGN KEY (cliente_id) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 4547 (class 2606 OID 25639)
-- Name: cliente_direcciones fk_cliente_estado; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_direcciones
    ADD CONSTRAINT fk_cliente_estado FOREIGN KEY (estadoid) REFERENCES public.estados(estadoid);


--
-- TOC entry 4564 (class 2606 OID 25644)
-- Name: detallesdelpedido fk_detalles_tamano; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT fk_detalles_tamano FOREIGN KEY (tamanoid) REFERENCES public.cat_tamanopaquetes(tamanoid);


--
-- TOC entry 4565 (class 2606 OID 25649)
-- Name: detallesdelpedido fk_detallesdelpedido_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT fk_detallesdelpedido_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 4567 (class 2606 OID 25654)
-- Name: detallesordencompra fk_detallesordencompra_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra
    ADD CONSTRAINT fk_detallesordencompra_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 4593 (class 2606 OID 25659)
-- Name: producto_imagenes fk_imagen_producto_maestro; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_imagenes
    ADD CONSTRAINT fk_imagen_producto_maestro FOREIGN KEY (productoid) REFERENCES public.productos(productoid) ON DELETE CASCADE;


--
-- TOC entry 4609 (class 2606 OID 25886)
-- Name: producto_imagenes_color fk_imagencolor_producto; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_imagenes_color
    ADD CONSTRAINT fk_imagencolor_producto FOREIGN KEY (productoid) REFERENCES public.productos(productoid) ON DELETE CASCADE;


--
-- TOC entry 4571 (class 2606 OID 25664)
-- Name: itemsdelcarrito fk_items_tamano; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT fk_items_tamano FOREIGN KEY (tamanoid) REFERENCES public.cat_tamanopaquetes(tamanoid);


--
-- TOC entry 4572 (class 2606 OID 25669)
-- Name: itemsdelcarrito fk_itemsdelcarrito_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT fk_itemsdelcarrito_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 4574 (class 2606 OID 25674)
-- Name: log_eventosusuario fk_log_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario
    ADD CONSTRAINT fk_log_cliente FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 4578 (class 2606 OID 25679)
-- Name: log_movimientos fk_log_usuario; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_movimientos
    ADD CONSTRAINT fk_log_usuario FOREIGN KEY (usuarioid) REFERENCES public.administradores(adminid) ON DELETE SET NULL;


--
-- TOC entry 4575 (class 2606 OID 25684)
-- Name: log_eventosusuario fk_log_variante; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario
    ADD CONSTRAINT fk_log_variante FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 4576 (class 2606 OID 25689)
-- Name: log_inventario fk_loginventario_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_inventario
    ADD CONSTRAINT fk_loginventario_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 4556 (class 2606 OID 25694)
-- Name: credito_movimientos fk_movimiento_credito; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.credito_movimientos
    ADD CONSTRAINT fk_movimiento_credito FOREIGN KEY (credito_id) REFERENCES public.cliente_creditos(credito_id) ON DELETE CASCADE;


--
-- TOC entry 4582 (class 2606 OID 25699)
-- Name: pagos_clientes fk_pagos_clientes_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_clientes
    ADD CONSTRAINT fk_pagos_clientes_cliente FOREIGN KEY (cliente_id) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 4583 (class 2606 OID 25704)
-- Name: pagos_clientes fk_pagos_clientes_credito; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_clientes
    ADD CONSTRAINT fk_pagos_clientes_credito FOREIGN KEY (credito_id) REFERENCES public.cliente_creditos(credito_id) ON DELETE SET NULL;


--
-- TOC entry 4584 (class 2606 OID 25709)
-- Name: pagos_clientes fk_pagos_clientes_validador; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_clientes
    ADD CONSTRAINT fk_pagos_clientes_validador FOREIGN KEY (validado_por) REFERENCES public.administradores(adminid) ON DELETE SET NULL;


--
-- TOC entry 4585 (class 2606 OID 25714)
-- Name: pagos_cxp fk_pagos_cxp; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_cxp
    ADD CONSTRAINT fk_pagos_cxp FOREIGN KEY (cxp_id) REFERENCES public.cuentas_por_pagar(cxp_id) ON DELETE CASCADE;


--
-- TOC entry 4586 (class 2606 OID 25719)
-- Name: pagos_cxp fk_pagos_usuario; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_cxp
    ADD CONSTRAINT fk_pagos_usuario FOREIGN KEY (usuario_id) REFERENCES public.administradores(adminid);


--
-- TOC entry 4587 (class 2606 OID 25724)
-- Name: passwordresettokens fk_passwordreset_agente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT fk_passwordreset_agente FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid) ON DELETE CASCADE;


--
-- TOC entry 4588 (class 2606 OID 25729)
-- Name: passwordresettokens fk_passwordreset_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT fk_passwordreset_cliente FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 4552 (class 2606 OID 25734)
-- Name: communicationlogs fk_pedido; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT fk_pedido FOREIGN KEY (pedidoid) REFERENCES public.pedidos(pedidoid);


--
-- TOC entry 4597 (class 2606 OID 25739)
-- Name: producto_variantes fk_producto_maestro; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT fk_producto_maestro FOREIGN KEY (productoid) REFERENCES public.productos(productoid);


--
-- TOC entry 4600 (class 2606 OID 25744)
-- Name: productos fk_producto_regla_empaque; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT fk_producto_regla_empaque FOREIGN KEY (reglaid) REFERENCES public.proveedor_reglas_empaque(reglaid);


--
-- TOC entry 4553 (class 2606 OID 25749)
-- Name: communicationlogs fk_proveedor; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT fk_proveedor FOREIGN KEY (proveedorid) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 4601 (class 2606 OID 25754)
-- Name: productos fk_proveedor_default; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT fk_proveedor_default FOREIGN KEY (proveedorid_default) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 4603 (class 2606 OID 25759)
-- Name: proveedor_reglas_empaque fk_regla_proveedor; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedor_reglas_empaque
    ADD CONSTRAINT fk_regla_proveedor FOREIGN KEY (proveedorid) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 4604 (class 2606 OID 25764)
-- Name: proveedor_reglas_empaque fk_regla_tipo; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedor_reglas_empaque
    ADD CONSTRAINT fk_regla_tipo FOREIGN KEY (tipoproductoid) REFERENCES public.tipoproducto(tipoproductoid);


--
-- TOC entry 4605 (class 2606 OID 25769)
-- Name: solicitudes_credito fk_solicitud_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.solicitudes_credito
    ADD CONSTRAINT fk_solicitud_cliente FOREIGN KEY (cliente_id) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 4594 (class 2606 OID 25774)
-- Name: producto_tamanosdisponibles fk_tamanos_producto; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_tamanosdisponibles
    ADD CONSTRAINT fk_tamanos_producto FOREIGN KEY (productoid) REFERENCES public.productos(productoid);


--
-- TOC entry 4595 (class 2606 OID 25779)
-- Name: producto_tamanosdisponibles fk_tamanos_tamano; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_tamanosdisponibles
    ADD CONSTRAINT fk_tamanos_tamano FOREIGN KEY (tamanoid) REFERENCES public.cat_tamanopaquetes(tamanoid);


--
-- TOC entry 4573 (class 2606 OID 25784)
-- Name: itemsdelcarrito itemsdelcarrito_carritoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT itemsdelcarrito_carritoid_fkey FOREIGN KEY (carritoid) REFERENCES public.carritodecompra(carritoid);


--
-- TOC entry 4577 (class 2606 OID 25789)
-- Name: log_inventario log_inventario_cxp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_inventario
    ADD CONSTRAINT log_inventario_cxp_id_fkey FOREIGN KEY (cxp_id) REFERENCES public.cuentas_por_pagar(cxp_id) ON DELETE SET NULL;


--
-- TOC entry 4579 (class 2606 OID 25794)
-- Name: medidas medidas_tipoproductoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas
    ADD CONSTRAINT medidas_tipoproductoid_fkey FOREIGN KEY (tipoproductoid) REFERENCES public.tipoproducto(tipoproductoid);


--
-- TOC entry 4568 (class 2606 OID 25799)
-- Name: notificaciones notificaciones_administrador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_administrador_id_fkey FOREIGN KEY (administrador_id) REFERENCES public.administradores(adminid) ON DELETE CASCADE;


--
-- TOC entry 4569 (class 2606 OID 25804)
-- Name: notificaciones notificaciones_agente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.agentesdeventas(agenteid) ON DELETE CASCADE;


--
-- TOC entry 4570 (class 2606 OID 25809)
-- Name: notificaciones notificaciones_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 4580 (class 2606 OID 25814)
-- Name: ordenesdecompra ordenesdecompra_proveedorid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.ordenesdecompra
    ADD CONSTRAINT ordenesdecompra_proveedorid_fkey FOREIGN KEY (proveedorid) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 4581 (class 2606 OID 25819)
-- Name: ordenesdecompra ordenesdecompra_usuario_creador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.ordenesdecompra
    ADD CONSTRAINT ordenesdecompra_usuario_creador_id_fkey FOREIGN KEY (usuario_creador_id) REFERENCES public.administradores(adminid);


--
-- TOC entry 4589 (class 2606 OID 25824)
-- Name: pedidos pedidos_agenteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_agenteid_fkey FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid);


--
-- TOC entry 4590 (class 2606 OID 25829)
-- Name: pedidos pedidos_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 4591 (class 2606 OID 25908)
-- Name: pedidos pedidos_cupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_cupon_id_fkey FOREIGN KEY (cupon_id) REFERENCES public.cupones(cuponid);


--
-- TOC entry 4592 (class 2606 OID 25834)
-- Name: pedidos pedidos_direccionenvioid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_direccionenvioid_fkey FOREIGN KEY (direccionenvioid) REFERENCES public.cliente_direcciones(direccionid);


--
-- TOC entry 4596 (class 2606 OID 25839)
-- Name: producto_variante_imagenes producto_variante_imagenes_varianteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variante_imagenes
    ADD CONSTRAINT producto_variante_imagenes_varianteid_fkey FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid) ON DELETE CASCADE;


--
-- TOC entry 4602 (class 2606 OID 25844)
-- Name: productos productos_categoriaid_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_categoriaid_fkey1 FOREIGN KEY (categoriaid) REFERENCES public.categorias(categoriaid);


--
-- TOC entry 4598 (class 2606 OID 25849)
-- Name: producto_variantes productos_medidaid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_medidaid_fkey FOREIGN KEY (medidaid) REFERENCES public.medidas(medidaid);


--
-- TOC entry 4599 (class 2606 OID 25854)
-- Name: producto_variantes productos_tipoproductoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_tipoproductoid_fkey FOREIGN KEY (tipoproductoid) REFERENCES public.tipoproducto(tipoproductoid);


--
-- TOC entry 4606 (class 2606 OID 25859)
-- Name: toma_inventario_conteos toma_inventario_conteos_sesionid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_conteos
    ADD CONSTRAINT toma_inventario_conteos_sesionid_fkey FOREIGN KEY (sesionid) REFERENCES public.toma_inventario_sesiones(sesionid) ON DELETE CASCADE;


--
-- TOC entry 4607 (class 2606 OID 25864)
-- Name: toma_inventario_conteos toma_inventario_conteos_varianteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_conteos
    ADD CONSTRAINT toma_inventario_conteos_varianteid_fkey FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 4608 (class 2606 OID 25869)
-- Name: toma_inventario_sesiones toma_inventario_sesiones_usuario_creador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_sesiones
    ADD CONSTRAINT toma_inventario_sesiones_usuario_creador_id_fkey FOREIGN KEY (usuario_creador_id) REFERENCES public.administradores(adminid);


--
-- TOC entry 4853 (class 0 OID 0)
-- Dependencies: 9
-- Name: SCHEMA cron; Type: ACL; Schema: -; Owner: azuresu
--

GRANT USAGE ON SCHEMA cron TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4856 (class 0 OID 0)
-- Dependencies: 345
-- Name: FUNCTION alter_job(job_id bigint, schedule text, command text, database text, username text, active boolean); Type: ACL; Schema: cron; Owner: azuresu
--

GRANT ALL ON FUNCTION cron.alter_job(job_id bigint, schedule text, command text, database text, username text, active boolean) TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4857 (class 0 OID 0)
-- Dependencies: 344
-- Name: FUNCTION job_cache_invalidate(); Type: ACL; Schema: cron; Owner: azuresu
--

GRANT ALL ON FUNCTION cron.job_cache_invalidate() TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4858 (class 0 OID 0)
-- Dependencies: 342
-- Name: FUNCTION schedule(schedule text, command text); Type: ACL; Schema: cron; Owner: azuresu
--

GRANT ALL ON FUNCTION cron.schedule(schedule text, command text) TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4859 (class 0 OID 0)
-- Dependencies: 320
-- Name: FUNCTION schedule(job_name text, schedule text, command text); Type: ACL; Schema: cron; Owner: azuresu
--

GRANT ALL ON FUNCTION cron.schedule(job_name text, schedule text, command text) TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4860 (class 0 OID 0)
-- Dependencies: 346
-- Name: FUNCTION schedule_in_database(job_name text, schedule text, command text, database text, username text, active boolean); Type: ACL; Schema: cron; Owner: azuresu
--

GRANT ALL ON FUNCTION cron.schedule_in_database(job_name text, schedule text, command text, database text, username text, active boolean) TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4861 (class 0 OID 0)
-- Dependencies: 343
-- Name: FUNCTION unschedule(job_id bigint); Type: ACL; Schema: cron; Owner: azuresu
--

GRANT ALL ON FUNCTION cron.unschedule(job_id bigint) TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4862 (class 0 OID 0)
-- Dependencies: 347
-- Name: FUNCTION unschedule(job_name text); Type: ACL; Schema: cron; Owner: azuresu
--

GRANT ALL ON FUNCTION cron.unschedule(job_name text) TO azure_pg_admin WITH GRANT OPTION;


--
-- TOC entry 4863 (class 0 OID 0)
-- Dependencies: 321
-- Name: FUNCTION pg_replication_origin_advance(text, pg_lsn); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_advance(text, pg_lsn) TO azure_pg_admin;


--
-- TOC entry 4864 (class 0 OID 0)
-- Dependencies: 322
-- Name: FUNCTION pg_replication_origin_create(text); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_create(text) TO azure_pg_admin;


--
-- TOC entry 4865 (class 0 OID 0)
-- Dependencies: 323
-- Name: FUNCTION pg_replication_origin_drop(text); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_drop(text) TO azure_pg_admin;


--
-- TOC entry 4866 (class 0 OID 0)
-- Dependencies: 314
-- Name: FUNCTION pg_replication_origin_oid(text); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_oid(text) TO azure_pg_admin;


--
-- TOC entry 4867 (class 0 OID 0)
-- Dependencies: 315
-- Name: FUNCTION pg_replication_origin_progress(text, boolean); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_progress(text, boolean) TO azure_pg_admin;


--
-- TOC entry 4868 (class 0 OID 0)
-- Dependencies: 324
-- Name: FUNCTION pg_replication_origin_session_is_setup(); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_session_is_setup() TO azure_pg_admin;


--
-- TOC entry 4869 (class 0 OID 0)
-- Dependencies: 325
-- Name: FUNCTION pg_replication_origin_session_progress(boolean); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_session_progress(boolean) TO azure_pg_admin;


--
-- TOC entry 4870 (class 0 OID 0)
-- Dependencies: 326
-- Name: FUNCTION pg_replication_origin_session_reset(); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_session_reset() TO azure_pg_admin;


--
-- TOC entry 4871 (class 0 OID 0)
-- Dependencies: 327
-- Name: FUNCTION pg_replication_origin_session_setup(text); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_session_setup(text) TO azure_pg_admin;


--
-- TOC entry 4872 (class 0 OID 0)
-- Dependencies: 330
-- Name: FUNCTION pg_replication_origin_xact_reset(); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_xact_reset() TO azure_pg_admin;


--
-- TOC entry 4873 (class 0 OID 0)
-- Dependencies: 328
-- Name: FUNCTION pg_replication_origin_xact_setup(pg_lsn, timestamp with time zone); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_replication_origin_xact_setup(pg_lsn, timestamp with time zone) TO azure_pg_admin;


--
-- TOC entry 4874 (class 0 OID 0)
-- Dependencies: 329
-- Name: FUNCTION pg_show_replication_origin_status(OUT local_id oid, OUT external_id text, OUT remote_lsn pg_lsn, OUT local_lsn pg_lsn); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_show_replication_origin_status(OUT local_id oid, OUT external_id text, OUT remote_lsn pg_lsn, OUT local_lsn pg_lsn) TO azure_pg_admin;


--
-- TOC entry 4875 (class 0 OID 0)
-- Dependencies: 317
-- Name: FUNCTION pg_stat_reset(); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_stat_reset() TO azure_pg_admin;


--
-- TOC entry 4876 (class 0 OID 0)
-- Dependencies: 316
-- Name: FUNCTION pg_stat_reset_shared(target text); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_stat_reset_shared(target text) TO azure_pg_admin;


--
-- TOC entry 4877 (class 0 OID 0)
-- Dependencies: 319
-- Name: FUNCTION pg_stat_reset_single_function_counters(oid); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_stat_reset_single_function_counters(oid) TO azure_pg_admin;


--
-- TOC entry 4878 (class 0 OID 0)
-- Dependencies: 318
-- Name: FUNCTION pg_stat_reset_single_table_counters(oid); Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT ALL ON FUNCTION pg_catalog.pg_stat_reset_single_table_counters(oid) TO azure_pg_admin;


--
-- TOC entry 4879 (class 0 OID 0)
-- Dependencies: 102
-- Name: COLUMN pg_config.name; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(name) ON TABLE pg_catalog.pg_config TO azure_pg_admin;


--
-- TOC entry 4880 (class 0 OID 0)
-- Dependencies: 102
-- Name: COLUMN pg_config.setting; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(setting) ON TABLE pg_catalog.pg_config TO azure_pg_admin;


--
-- TOC entry 4881 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.line_number; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(line_number) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4882 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.type; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(type) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4883 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.database; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(database) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4884 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.user_name; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(user_name) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4885 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.address; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(address) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4886 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.netmask; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(netmask) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4887 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.auth_method; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(auth_method) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4888 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.options; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(options) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4889 (class 0 OID 0)
-- Dependencies: 98
-- Name: COLUMN pg_hba_file_rules.error; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(error) ON TABLE pg_catalog.pg_hba_file_rules TO azure_pg_admin;


--
-- TOC entry 4890 (class 0 OID 0)
-- Dependencies: 149
-- Name: COLUMN pg_replication_origin_status.local_id; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(local_id) ON TABLE pg_catalog.pg_replication_origin_status TO azure_pg_admin;


--
-- TOC entry 4891 (class 0 OID 0)
-- Dependencies: 149
-- Name: COLUMN pg_replication_origin_status.external_id; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(external_id) ON TABLE pg_catalog.pg_replication_origin_status TO azure_pg_admin;


--
-- TOC entry 4892 (class 0 OID 0)
-- Dependencies: 149
-- Name: COLUMN pg_replication_origin_status.remote_lsn; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(remote_lsn) ON TABLE pg_catalog.pg_replication_origin_status TO azure_pg_admin;


--
-- TOC entry 4893 (class 0 OID 0)
-- Dependencies: 149
-- Name: COLUMN pg_replication_origin_status.local_lsn; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(local_lsn) ON TABLE pg_catalog.pg_replication_origin_status TO azure_pg_admin;


--
-- TOC entry 4894 (class 0 OID 0)
-- Dependencies: 103
-- Name: COLUMN pg_shmem_allocations.name; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(name) ON TABLE pg_catalog.pg_shmem_allocations TO azure_pg_admin;


--
-- TOC entry 4895 (class 0 OID 0)
-- Dependencies: 103
-- Name: COLUMN pg_shmem_allocations.off; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(off) ON TABLE pg_catalog.pg_shmem_allocations TO azure_pg_admin;


--
-- TOC entry 4896 (class 0 OID 0)
-- Dependencies: 103
-- Name: COLUMN pg_shmem_allocations.size; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(size) ON TABLE pg_catalog.pg_shmem_allocations TO azure_pg_admin;


--
-- TOC entry 4897 (class 0 OID 0)
-- Dependencies: 103
-- Name: COLUMN pg_shmem_allocations.allocated_size; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(allocated_size) ON TABLE pg_catalog.pg_shmem_allocations TO azure_pg_admin;


--
-- TOC entry 4898 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.starelid; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(starelid) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4899 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.staattnum; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(staattnum) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4900 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stainherit; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stainherit) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4901 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stanullfrac; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stanullfrac) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4902 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stawidth; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stawidth) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4903 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stadistinct; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stadistinct) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4904 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stakind1; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stakind1) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4905 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stakind2; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stakind2) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4906 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stakind3; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stakind3) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4907 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stakind4; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stakind4) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4908 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stakind5; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stakind5) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4909 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.staop1; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(staop1) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4910 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.staop2; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(staop2) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4911 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.staop3; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(staop3) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4912 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.staop4; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(staop4) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4913 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.staop5; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(staop5) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4914 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stacoll1; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stacoll1) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4915 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stacoll2; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stacoll2) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4916 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stacoll3; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stacoll3) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4917 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stacoll4; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stacoll4) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4918 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stacoll5; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stacoll5) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4919 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stanumbers1; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stanumbers1) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4920 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stanumbers2; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stanumbers2) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4921 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stanumbers3; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stanumbers3) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4922 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stanumbers4; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stanumbers4) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4923 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stanumbers5; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stanumbers5) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4924 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stavalues1; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stavalues1) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4925 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stavalues2; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stavalues2) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4926 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stavalues3; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stavalues3) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4927 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stavalues4; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stavalues4) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4928 (class 0 OID 0)
-- Dependencies: 43
-- Name: COLUMN pg_statistic.stavalues5; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(stavalues5) ON TABLE pg_catalog.pg_statistic TO azure_pg_admin;


--
-- TOC entry 4929 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.oid; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(oid) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 4930 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subdbid; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subdbid) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 4931 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subname; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subname) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 4932 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subowner; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subowner) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 4933 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subenabled; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subenabled) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 4934 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subconninfo; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subconninfo) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 4935 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subslotname; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subslotname) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 4936 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subsynccommit; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subsynccommit) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


--
-- TOC entry 4937 (class 0 OID 0)
-- Dependencies: 68
-- Name: COLUMN pg_subscription.subpublications; Type: ACL; Schema: pg_catalog; Owner: azuresu
--

GRANT SELECT(subpublications) ON TABLE pg_catalog.pg_subscription TO azure_pg_admin;


-- Completed on 2025-12-31 14:33:42

--
-- PostgreSQL database dump complete
--

