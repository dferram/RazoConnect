--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

-- Started on 2025-12-19 23:11:41

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
-- TOC entry 1014 (class 1247 OID 33690)
-- Name: estado_solicitud_enum; Type: TYPE; Schema: public; Owner: ferram
--

CREATE TYPE public.estado_solicitud_enum AS ENUM (
    'PENDIENTE',
    'APROBADO',
    'RECHAZADO'
);


ALTER TYPE public.estado_solicitud_enum OWNER TO ferram;

--
-- TOC entry 1026 (class 1247 OID 33764)
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
-- TOC entry 1038 (class 1247 OID 34113)
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
-- TOC entry 1023 (class 1247 OID 33757)
-- Name: estatus_sesion_enum; Type: TYPE; Schema: public; Owner: ferram
--

CREATE TYPE public.estatus_sesion_enum AS ENUM (
    'ABIERTA',
    'CERRADA',
    'APLICADA'
);


ALTER TYPE public.estatus_sesion_enum OWNER TO ferram;

--
-- TOC entry 1011 (class 1247 OID 33682)
-- Name: tipo_cambio_enum; Type: TYPE; Schema: public; Owner: ferram
--

CREATE TYPE public.tipo_cambio_enum AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE'
);


ALTER TYPE public.tipo_cambio_enum OWNER TO ferram;

--
-- TOC entry 297 (class 1255 OID 25532)
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
-- TOC entry 296 (class 1255 OID 25531)
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
-- TOC entry 298 (class 1255 OID 34556)
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
-- TOC entry 5515 (class 0 OID 0)
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
-- TOC entry 5516 (class 0 OID 0)
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
-- TOC entry 5517 (class 0 OID 0)
-- Dependencies: 227
-- Name: carritodecompra_carritoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.carritodecompra_carritoid_seq OWNED BY public.carritodecompra.carritoid;


--
-- TOC entry 286 (class 1259 OID 34172)
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
-- TOC entry 285 (class 1259 OID 34171)
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
-- TOC entry 5518 (class 0 OID 0)
-- Dependencies: 285
-- Name: cat_cxp_etiquetas_etiqueta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.cat_cxp_etiquetas_etiqueta_id_seq OWNED BY public.cat_cxp_etiquetas.etiqueta_id;


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
-- TOC entry 5519 (class 0 OID 0)
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
-- TOC entry 5520 (class 0 OID 0)
-- Dependencies: 221
-- Name: categorias_categoriaid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.categorias_categoriaid_seq OWNED BY public.categorias.categoriaid;


--
-- TOC entry 291 (class 1259 OID 34522)
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
    ultima_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.cliente_creditos OWNER TO ferram;

--
-- TOC entry 290 (class 1259 OID 34521)
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
-- TOC entry 5521 (class 0 OID 0)
-- Dependencies: 290
-- Name: cliente_creditos_credito_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.cliente_creditos_credito_id_seq OWNED BY public.cliente_creditos.credito_id;


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
-- TOC entry 5522 (class 0 OID 0)
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
-- TOC entry 5523 (class 0 OID 0)
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
-- TOC entry 5524 (class 0 OID 0)
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
-- TOC entry 5525 (class 0 OID 0)
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
-- TOC entry 5526 (class 0 OID 0)
-- Dependencies: 271
-- Name: control_cambios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.control_cambios_id_seq OWNED BY public.control_cambios.id;


--
-- TOC entry 293 (class 1259 OID 34542)
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
    saldo_despues_movimiento numeric(15,2) NOT NULL
);


ALTER TABLE public.credito_movimientos OWNER TO ferram;

--
-- TOC entry 292 (class 1259 OID 34541)
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
-- TOC entry 5527 (class 0 OID 0)
-- Dependencies: 292
-- Name: credito_movimientos_movimiento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.credito_movimientos_movimiento_id_seq OWNED BY public.credito_movimientos.movimiento_id;


--
-- TOC entry 282 (class 1259 OID 34124)
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
    CONSTRAINT chk_monto_pagado_positivo CHECK ((monto_pagado >= (0)::numeric)),
    CONSTRAINT chk_monto_total_positivo CHECK ((monto_total >= (0)::numeric)),
    CONSTRAINT chk_pago_no_excede_total CHECK ((monto_pagado <= monto_total))
);


ALTER TABLE public.cuentas_por_pagar OWNER TO ferram;

--
-- TOC entry 281 (class 1259 OID 34123)
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
-- TOC entry 5528 (class 0 OID 0)
-- Dependencies: 281
-- Name: cuentas_por_pagar_cxp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.cuentas_por_pagar_cxp_id_seq OWNED BY public.cuentas_por_pagar.cxp_id;


--
-- TOC entry 288 (class 1259 OID 34181)
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
-- TOC entry 287 (class 1259 OID 34180)
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
-- TOC entry 5529 (class 0 OID 0)
-- Dependencies: 287
-- Name: cxp_etiquetas_asignadas_asignacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.cxp_etiquetas_asignadas_asignacion_id_seq OWNED BY public.cxp_etiquetas_asignadas.asignacion_id;


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
-- TOC entry 5530 (class 0 OID 0)
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
    cantidadrecibida integer DEFAULT 0 NOT NULL,
    piezasporpaquete integer DEFAULT 1,
    costounitario numeric(10,2) DEFAULT 0.00 NOT NULL,
    piezasrecibidas integer DEFAULT 0 NOT NULL,
    CONSTRAINT detallesordencompra_costounitario_chk CHECK ((costounitario >= (0)::numeric))
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
-- TOC entry 5531 (class 0 OID 0)
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
    CONSTRAINT notificaciones_prioridad_check CHECK (((prioridad)::text = ANY ((ARRAY['baja'::character varying, 'normal'::character varying, 'alta'::character varying, 'urgente'::character varying])::text[]))),
    CONSTRAINT notificaciones_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['pedido'::character varying, 'oferta'::character varying, 'temporada'::character varying, 'backorder'::character varying, 'sistema'::character varying, 'producto'::character varying])::text[])))
);


ALTER TABLE public.notificaciones OWNER TO ferram;

--
-- TOC entry 5532 (class 0 OID 0)
-- Dependencies: 267
-- Name: TABLE notificaciones; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.notificaciones IS 'Notificaciones para clientes del sistema';


--
-- TOC entry 5533 (class 0 OID 0)
-- Dependencies: 267
-- Name: COLUMN notificaciones.tipo; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.notificaciones.tipo IS 'Tipo de notificación: pedido, oferta, temporada, backorder, sistema, producto';


--
-- TOC entry 5534 (class 0 OID 0)
-- Dependencies: 267
-- Name: COLUMN notificaciones.metadata; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.notificaciones.metadata IS 'Información adicional en formato JSON (ej: pedidoId, productoId, etc)';


--
-- TOC entry 5535 (class 0 OID 0)
-- Dependencies: 267
-- Name: COLUMN notificaciones.url; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON COLUMN public.notificaciones.url IS 'URL de redirección al hacer click en la notificación';


--
-- TOC entry 5536 (class 0 OID 0)
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
-- TOC entry 5537 (class 0 OID 0)
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
-- TOC entry 5538 (class 0 OID 0)
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
-- TOC entry 5539 (class 0 OID 0)
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
-- TOC entry 5540 (class 0 OID 0)
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
    usuarioid integer,
    es_excepcion boolean DEFAULT false,
    cxp_id integer
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
-- TOC entry 5541 (class 0 OID 0)
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
-- TOC entry 5542 (class 0 OID 0)
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
-- TOC entry 5543 (class 0 OID 0)
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
-- TOC entry 5544 (class 0 OID 0)
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
-- TOC entry 5545 (class 0 OID 0)
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
    origenoc character varying(20) DEFAULT 'manual'::character varying,
    fechasolicitud timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    total numeric(12,2) DEFAULT 0.00 NOT NULL,
    usuario_creador_id integer
);


ALTER TABLE public.ordenesdecompra OWNER TO ferram;

--
-- TOC entry 5546 (class 0 OID 0)
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
-- TOC entry 5547 (class 0 OID 0)
-- Dependencies: 245
-- Name: ordenesdecompra_ordencompraid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.ordenesdecompra_ordencompraid_seq OWNED BY public.ordenesdecompra.ordencompraid;


--
-- TOC entry 284 (class 1259 OID 34150)
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
-- TOC entry 283 (class 1259 OID 34149)
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
-- TOC entry 5548 (class 0 OID 0)
-- Dependencies: 283
-- Name: pagos_cxp_pago_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.pagos_cxp_pago_id_seq OWNED BY public.pagos_cxp.pago_id;


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
-- TOC entry 5549 (class 0 OID 0)
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
-- TOC entry 5550 (class 0 OID 0)
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
-- TOC entry 5551 (class 0 OID 0)
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
-- TOC entry 279 (class 1259 OID 34095)
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
-- TOC entry 280 (class 1259 OID 34101)
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
-- TOC entry 5552 (class 0 OID 0)
-- Dependencies: 280
-- Name: producto_variante_imagenes_imagenid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.producto_variante_imagenes_imagenid_seq OWNED BY public.producto_variante_imagenes.imagenid;


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
    piezasporpaquete integer DEFAULT 1,
    stock_minimo integer DEFAULT 0 NOT NULL,
    color_nombre character varying(100) DEFAULT NULL::character varying,
    url_imagen_variante text,
    color_hex character varying(20) DEFAULT NULL::character varying
);


ALTER TABLE public.producto_variantes OWNER TO postgres;

--
-- TOC entry 5553 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN producto_variantes.tipoproductoid; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.producto_variantes.tipoproductoid IS 'Formato físico del producto (Caja, Bolsa, etc.)';


--
-- TOC entry 5554 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN producto_variantes.url_imagen_variante; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.producto_variantes.url_imagen_variante IS 'Imagen específica para el selector visual de variantes (Estilo Nike)';


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
-- TOC entry 5555 (class 0 OID 0)
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
    sku_maestro character varying(20),
    tipoproductoid integer
);


ALTER TABLE public.productos OWNER TO ferram;

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
-- TOC entry 5556 (class 0 OID 0)
-- Dependencies: 253
-- Name: productos_productoid_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.productos_productoid_seq1 OWNED BY public.productos.productoid;


--
-- TOC entry 274 (class 1259 OID 33723)
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
-- TOC entry 273 (class 1259 OID 33722)
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
-- TOC entry 5557 (class 0 OID 0)
-- Dependencies: 273
-- Name: proveedor_reglas_empaque_reglaid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.proveedor_reglas_empaque_reglaid_seq OWNED BY public.proveedor_reglas_empaque.reglaid;


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
-- TOC entry 5558 (class 0 OID 0)
-- Dependencies: 243
-- Name: proveedores_proveedorid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.proveedores_proveedorid_seq OWNED BY public.proveedores.proveedorid;


--
-- TOC entry 295 (class 1259 OID 34560)
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
-- TOC entry 294 (class 1259 OID 34559)
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
-- TOC entry 5559 (class 0 OID 0)
-- Dependencies: 294
-- Name: solicitudes_credito_solicitud_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.solicitudes_credito_solicitud_id_seq OWNED BY public.solicitudes_credito.solicitud_id;


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
-- TOC entry 5560 (class 0 OID 0)
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
-- TOC entry 5561 (class 0 OID 0)
-- Dependencies: 249
-- Name: tipoproducto_tipoproductoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.tipoproducto_tipoproductoid_seq OWNED BY public.tipoproducto.tipoproductoid;


--
-- TOC entry 278 (class 1259 OID 33788)
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
    CONSTRAINT chk_usuarios_auditoria CHECK ((((conteo_a IS NULL) AND (usuario_a_id IS NULL)) OR ((conteo_a IS NOT NULL) AND (usuario_a_id IS NOT NULL))))
);


ALTER TABLE public.toma_inventario_conteos OWNER TO ferram;

--
-- TOC entry 5562 (class 0 OID 0)
-- Dependencies: 278
-- Name: TABLE toma_inventario_conteos; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.toma_inventario_conteos IS 'Registros individuales de conteo doble ciego. Requiere coincidencia de A y B para validar.';


--
-- TOC entry 277 (class 1259 OID 33787)
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
-- TOC entry 5563 (class 0 OID 0)
-- Dependencies: 277
-- Name: toma_inventario_conteos_conteoid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.toma_inventario_conteos_conteoid_seq OWNED BY public.toma_inventario_conteos.conteoid;


--
-- TOC entry 276 (class 1259 OID 33774)
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
-- TOC entry 5564 (class 0 OID 0)
-- Dependencies: 276
-- Name: TABLE toma_inventario_sesiones; Type: COMMENT; Schema: public; Owner: ferram
--

COMMENT ON TABLE public.toma_inventario_sesiones IS 'Cabecera para agrupador tomas de inventario físicas (Auditorías)';


--
-- TOC entry 275 (class 1259 OID 33773)
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
-- TOC entry 5565 (class 0 OID 0)
-- Dependencies: 275
-- Name: toma_inventario_sesiones_sesionid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ferram
--

ALTER SEQUENCE public.toma_inventario_sesiones_sesionid_seq OWNED BY public.toma_inventario_sesiones.sesionid;


--
-- TOC entry 289 (class 1259 OID 34207)
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
-- TOC entry 4993 (class 2604 OID 17403)
-- Name: administradores adminid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.administradores ALTER COLUMN adminid SET DEFAULT nextval('public.administradores_adminid_seq'::regclass);


--
-- TOC entry 4960 (class 2604 OID 17225)
-- Name: agentesdeventas agenteid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agentesdeventas ALTER COLUMN agenteid SET DEFAULT nextval('public.agentesdeventas_agenteid_seq'::regclass);


--
-- TOC entry 4975 (class 2604 OID 17285)
-- Name: carritodecompra carritoid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.carritodecompra ALTER COLUMN carritoid SET DEFAULT nextval('public.carritodecompra_carritoid_seq'::regclass);


--
-- TOC entry 5051 (class 2604 OID 34175)
-- Name: cat_cxp_etiquetas etiqueta_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_cxp_etiquetas ALTER COLUMN etiqueta_id SET DEFAULT nextval('public.cat_cxp_etiquetas_etiqueta_id_seq'::regclass);


--
-- TOC entry 5025 (class 2604 OID 25443)
-- Name: cat_tamanopaquetes tamanoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_tamanopaquetes ALTER COLUMN tamanoid SET DEFAULT nextval('public.cat_tamanopaquetes_tamanoid_seq'::regclass);


--
-- TOC entry 4963 (class 2604 OID 17239)
-- Name: categorias categoriaid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categorias ALTER COLUMN categoriaid SET DEFAULT nextval('public.categorias_categoriaid_seq'::regclass);


--
-- TOC entry 5056 (class 2604 OID 34525)
-- Name: cliente_creditos credito_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_creditos ALTER COLUMN credito_id SET DEFAULT nextval('public.cliente_creditos_credito_id_seq'::regclass);


--
-- TOC entry 4978 (class 2604 OID 17315)
-- Name: cliente_direcciones direccionid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cliente_direcciones ALTER COLUMN direccionid SET DEFAULT nextval('public.cliente_direcciones_direccionid_seq'::regclass);


--
-- TOC entry 4957 (class 2604 OID 17213)
-- Name: clientes clienteid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes ALTER COLUMN clienteid SET DEFAULT nextval('public.clientes_clienteid_seq'::regclass);


--
-- TOC entry 4987 (class 2604 OID 17370)
-- Name: comisiones comisionid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comisiones ALTER COLUMN comisionid SET DEFAULT nextval('public.comisiones_comisionid_seq'::regclass);


--
-- TOC entry 5019 (class 2604 OID 17554)
-- Name: communicationlogs logid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs ALTER COLUMN logid SET DEFAULT nextval('public.communicationlogs_logid_seq'::regclass);


--
-- TOC entry 5033 (class 2604 OID 33701)
-- Name: control_cambios id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.control_cambios ALTER COLUMN id SET DEFAULT nextval('public.control_cambios_id_seq'::regclass);


--
-- TOC entry 5063 (class 2604 OID 34545)
-- Name: credito_movimientos movimiento_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.credito_movimientos ALTER COLUMN movimiento_id SET DEFAULT nextval('public.credito_movimientos_movimiento_id_seq'::regclass);


--
-- TOC entry 5045 (class 2604 OID 34127)
-- Name: cuentas_por_pagar cxp_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_pagar ALTER COLUMN cxp_id SET DEFAULT nextval('public.cuentas_por_pagar_cxp_id_seq'::regclass);


--
-- TOC entry 5054 (class 2604 OID 34184)
-- Name: cxp_etiquetas_asignadas asignacion_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cxp_etiquetas_asignadas ALTER COLUMN asignacion_id SET DEFAULT nextval('public.cxp_etiquetas_asignadas_asignacion_id_seq'::regclass);


--
-- TOC entry 4983 (class 2604 OID 17353)
-- Name: detallesdelpedido detalleid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detallesdelpedido ALTER COLUMN detalleid SET DEFAULT nextval('public.detallesdelpedido_detalleid_seq'::regclass);


--
-- TOC entry 5004 (class 2604 OID 17440)
-- Name: detallesordencompra detalleoc_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra ALTER COLUMN detalleoc_id SET DEFAULT nextval('public.detallesordencompra_detalleoc_id_seq'::regclass);


--
-- TOC entry 5022 (class 2604 OID 25403)
-- Name: estados estadoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados ALTER COLUMN estadoid SET DEFAULT nextval('public.estados_estadoid_seq'::regclass);


--
-- TOC entry 4977 (class 2604 OID 17298)
-- Name: itemsdelcarrito itemid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.itemsdelcarrito ALTER COLUMN itemid SET DEFAULT nextval('public.itemsdelcarrito_itemid_seq'::regclass);


--
-- TOC entry 5023 (class 2604 OID 25419)
-- Name: log_eventosusuario eventoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario ALTER COLUMN eventoid SET DEFAULT nextval('public.log_eventosusuario_eventoid_seq'::regclass);


--
-- TOC entry 4990 (class 2604 OID 17389)
-- Name: log_inventario logid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.log_inventario ALTER COLUMN logid SET DEFAULT nextval('public.log_inventario_logid_seq'::regclass);


--
-- TOC entry 5031 (class 2604 OID 25545)
-- Name: log_movimientos logid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_movimientos ALTER COLUMN logid SET DEFAULT nextval('public.log_movimientos_logid_seq'::regclass);


--
-- TOC entry 5012 (class 2604 OID 17471)
-- Name: medidas medidaid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas ALTER COLUMN medidaid SET DEFAULT nextval('public.medidas_medidaid_seq'::regclass);


--
-- TOC entry 5026 (class 2604 OID 25511)
-- Name: notificaciones notificacionid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones ALTER COLUMN notificacionid SET DEFAULT nextval('public.notificaciones_notificacionid_seq'::regclass);


--
-- TOC entry 4998 (class 2604 OID 17426)
-- Name: ordenesdecompra ordencompraid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.ordenesdecompra ALTER COLUMN ordencompraid SET DEFAULT nextval('public.ordenesdecompra_ordencompraid_seq'::regclass);


--
-- TOC entry 5049 (class 2604 OID 34153)
-- Name: pagos_cxp pago_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_cxp ALTER COLUMN pago_id SET DEFAULT nextval('public.pagos_cxp_pago_id_seq'::regclass);


--
-- TOC entry 5021 (class 2604 OID 17581)
-- Name: passwordresettokens tokenid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens ALTER COLUMN tokenid SET DEFAULT nextval('public.passwordresettokens_tokenid_seq'::regclass);


--
-- TOC entry 4979 (class 2604 OID 17329)
-- Name: pedidos pedidoid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pedidos ALTER COLUMN pedidoid SET DEFAULT nextval('public.pedidos_pedidoid_seq'::regclass);


--
-- TOC entry 4973 (class 2604 OID 17270)
-- Name: producto_imagenes imagenid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_imagenes ALTER COLUMN imagenid SET DEFAULT nextval('public.producto_imagenes_imagenid_seq'::regclass);


--
-- TOC entry 5043 (class 2604 OID 34102)
-- Name: producto_variante_imagenes imagenid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variante_imagenes ALTER COLUMN imagenid SET DEFAULT nextval('public.producto_variante_imagenes_imagenid_seq'::regclass);


--
-- TOC entry 4965 (class 2604 OID 17253)
-- Name: producto_variantes varianteid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_variantes ALTER COLUMN varianteid SET DEFAULT nextval('public.producto_variantes_varianteid_seq'::regclass);


--
-- TOC entry 5017 (class 2604 OID 17501)
-- Name: productos productoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos ALTER COLUMN productoid SET DEFAULT nextval('public.productos_productoid_seq1'::regclass);


--
-- TOC entry 5036 (class 2604 OID 33726)
-- Name: proveedor_reglas_empaque reglaid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedor_reglas_empaque ALTER COLUMN reglaid SET DEFAULT nextval('public.proveedor_reglas_empaque_reglaid_seq'::regclass);


--
-- TOC entry 4997 (class 2604 OID 17417)
-- Name: proveedores proveedorid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedores ALTER COLUMN proveedorid SET DEFAULT nextval('public.proveedores_proveedorid_seq'::regclass);


--
-- TOC entry 5065 (class 2604 OID 34563)
-- Name: solicitudes_credito solicitud_id; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.solicitudes_credito ALTER COLUMN solicitud_id SET DEFAULT nextval('public.solicitudes_credito_solicitud_id_seq'::regclass);


--
-- TOC entry 5009 (class 2604 OID 17458)
-- Name: tipoproducto tipoproductoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.tipoproducto ALTER COLUMN tipoproductoid SET DEFAULT nextval('public.tipoproducto_tipoproductoid_seq'::regclass);


--
-- TOC entry 5041 (class 2604 OID 33791)
-- Name: toma_inventario_conteos conteoid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_conteos ALTER COLUMN conteoid SET DEFAULT nextval('public.toma_inventario_conteos_conteoid_seq'::regclass);


--
-- TOC entry 5038 (class 2604 OID 33777)
-- Name: toma_inventario_sesiones sesionid; Type: DEFAULT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_sesiones ALTER COLUMN sesionid SET DEFAULT nextval('public.toma_inventario_sesiones_sesionid_seq'::regclass);


--
-- TOC entry 5458 (class 0 OID 17400)
-- Dependencies: 242
-- Data for Name: administradores; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.administradores (adminid, nombre, email, passwordhash, rol, activo, fechacreacion, apellido) VALUES (2, 'Fernando', 'fegarcia@hotmail.com', '$2b$10$qDMIe7cygYpnw13f67vMn.wxKqlrUV32fWdyXsUoRKDRw1XmrN/ma', 'superadmin', true, '2025-11-06 12:09:59.605448', 'Garcia                                                                                              ');


--
-- TOC entry 5436 (class 0 OID 17222)
-- Dependencies: 220
-- Data for Name: agentesdeventas; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.agentesdeventas (agenteid, nombre, apellido, email, passwordhash, codigoagente, activo, esadmin, adminrol) VALUES (1, 'Lupita', 'García', 'pupis_gr@hotmail.com', '$2b$10$6t8maMlHk52sLRQ4PSGnJe0y/6gbIlEQYtlNgba/HwV1LzArkqfie', 'AG0001', true, false, NULL);


--
-- TOC entry 5444 (class 0 OID 17282)
-- Dependencies: 228
-- Data for Name: carritodecompra; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.carritodecompra (carritoid, clienteid, fechacreacion, ultimamodificacion) VALUES (1, 1, '2025-12-19 17:46:56.916237', NULL);


--
-- TOC entry 5501 (class 0 OID 34172)
-- Dependencies: 286
-- Data for Name: cat_cxp_etiquetas; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5480 (class 0 OID 25440)
-- Dependencies: 264
-- Data for Name: cat_tamanopaquetes; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.cat_tamanopaquetes (tamanoid, cantidad) VALUES (1, 1);
INSERT INTO public.cat_tamanopaquetes (tamanoid, cantidad) VALUES (2, 3);
INSERT INTO public.cat_tamanopaquetes (tamanoid, cantidad) VALUES (3, 6);
INSERT INTO public.cat_tamanopaquetes (tamanoid, cantidad) VALUES (4, 12);
INSERT INTO public.cat_tamanopaquetes (tamanoid, cantidad) VALUES (5, 4);


--
-- TOC entry 5438 (class 0 OID 17236)
-- Dependencies: 222
-- Data for Name: categorias; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.categorias (categoriaid, nombre, descripcion, parentcategoriaid, activo) VALUES (1, 'Lisas', 'Cajas perfectas para cualquier época del año!', NULL, true);


--
-- TOC entry 5505 (class 0 OID 34522)
-- Dependencies: 291
-- Data for Name: cliente_creditos; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5448 (class 0 OID 17312)
-- Dependencies: 232
-- Data for Name: cliente_direcciones; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5434 (class 0 OID 17210)
-- Dependencies: 218
-- Data for Name: clientes; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.clientes (clienteid, nombre, apellido, email, passwordhash, telefono, fechaderegistro, activo, agenteid, google_id, avatar_url) VALUES (1, 'Diego Fernando', 'Ramírez García', 'dferram8@gmail.com', NULL, NULL, '2025-12-19 12:11:47.325519', true, NULL, '112463414682839499861', 'https://lh3.googleusercontent.com/a/ACg8ocL4vAqVyYj3GucQspTlE6BtmuyoqZqML7L4Zcb7WdwdcHT9m4E=s96-c');


--
-- TOC entry 5454 (class 0 OID 17367)
-- Dependencies: 238
-- Data for Name: comisiones; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5472 (class 0 OID 17551)
-- Dependencies: 256
-- Data for Name: communicationlogs; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5487 (class 0 OID 33698)
-- Dependencies: 272
-- Data for Name: control_cambios; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5507 (class 0 OID 34542)
-- Dependencies: 293
-- Data for Name: credito_movimientos; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5497 (class 0 OID 34124)
-- Dependencies: 282
-- Data for Name: cuentas_por_pagar; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5503 (class 0 OID 34181)
-- Dependencies: 288
-- Data for Name: cxp_etiquetas_asignadas; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5452 (class 0 OID 17350)
-- Dependencies: 236
-- Data for Name: detallesdelpedido; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5464 (class 0 OID 17437)
-- Dependencies: 248
-- Data for Name: detallesordencompra; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5476 (class 0 OID 25400)
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
-- TOC entry 5446 (class 0 OID 17295)
-- Dependencies: 230
-- Data for Name: itemsdelcarrito; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5478 (class 0 OID 25416)
-- Dependencies: 262
-- Data for Name: log_eventosusuario; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5456 (class 0 OID 17386)
-- Dependencies: 240
-- Data for Name: log_inventario; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5485 (class 0 OID 25542)
-- Dependencies: 270
-- Data for Name: log_movimientos; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.log_movimientos (logid, usuarioid, nombreusuario, rol, accion, entidad, entidadid, detalles, ip, fecha) VALUES (1, 2, 'Fernando Garcia', 'admin', 'LOGIN', 'Admin', 2, '{"email": "fegarcia@hotmail.com", "origen": "admin"}', '::1', '2025-12-19 17:44:44.70313');


--
-- TOC entry 5468 (class 0 OID 17468)
-- Dependencies: 252
-- Data for Name: medidas; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5483 (class 0 OID 25508)
-- Dependencies: 267
-- Data for Name: notificaciones; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5462 (class 0 OID 17423)
-- Dependencies: 246
-- Data for Name: ordenesdecompra; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5499 (class 0 OID 34150)
-- Dependencies: 284
-- Data for Name: pagos_cxp; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5474 (class 0 OID 17578)
-- Dependencies: 258
-- Data for Name: passwordresettokens; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5450 (class 0 OID 17326)
-- Dependencies: 234
-- Data for Name: pedidos; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5442 (class 0 OID 17267)
-- Dependencies: 226
-- Data for Name: producto_imagenes; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5481 (class 0 OID 25448)
-- Dependencies: 265
-- Data for Name: producto_tamanosdisponibles; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5494 (class 0 OID 34095)
-- Dependencies: 279
-- Data for Name: producto_variante_imagenes; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5440 (class 0 OID 17250)
-- Dependencies: 224
-- Data for Name: producto_variantes; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5470 (class 0 OID 17498)
-- Dependencies: 254
-- Data for Name: productos; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5489 (class 0 OID 33723)
-- Dependencies: 274
-- Data for Name: proveedor_reglas_empaque; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5460 (class 0 OID 17414)
-- Dependencies: 244
-- Data for Name: proveedores; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5509 (class 0 OID 34560)
-- Dependencies: 295
-- Data for Name: solicitudes_credito; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5466 (class 0 OID 17455)
-- Dependencies: 250
-- Data for Name: tipoproducto; Type: TABLE DATA; Schema: public; Owner: ferram
--

INSERT INTO public.tipoproducto (tipoproductoid, nombre, descripcion, activo, fechacreacion) VALUES (1, 'Caja', NULL, true, '2025-12-11 19:06:19.742054');
INSERT INTO public.tipoproducto (tipoproductoid, nombre, descripcion, activo, fechacreacion) VALUES (2, 'Peluche', NULL, true, '2025-12-12 11:10:10.356383');
INSERT INTO public.tipoproducto (tipoproductoid, nombre, descripcion, activo, fechacreacion) VALUES (3, 'Bolsa', NULL, true, '2025-12-12 18:54:55.894453');
INSERT INTO public.tipoproducto (tipoproductoid, nombre, descripcion, activo, fechacreacion) VALUES (4, 'Cuadernos', NULL, true, '2025-12-12 18:57:10.106707');


--
-- TOC entry 5493 (class 0 OID 33788)
-- Dependencies: 278
-- Data for Name: toma_inventario_conteos; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5491 (class 0 OID 33774)
-- Dependencies: 276
-- Data for Name: toma_inventario_sesiones; Type: TABLE DATA; Schema: public; Owner: ferram
--



--
-- TOC entry 5566 (class 0 OID 0)
-- Dependencies: 241
-- Name: administradores_adminid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.administradores_adminid_seq', 3, true);


--
-- TOC entry 5567 (class 0 OID 0)
-- Dependencies: 219
-- Name: agentesdeventas_agenteid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.agentesdeventas_agenteid_seq', 1, true);


--
-- TOC entry 5568 (class 0 OID 0)
-- Dependencies: 227
-- Name: carritodecompra_carritoid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.carritodecompra_carritoid_seq', 1, true);


--
-- TOC entry 5569 (class 0 OID 0)
-- Dependencies: 285
-- Name: cat_cxp_etiquetas_etiqueta_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cat_cxp_etiquetas_etiqueta_id_seq', 1, false);


--
-- TOC entry 5570 (class 0 OID 0)
-- Dependencies: 263
-- Name: cat_tamanopaquetes_tamanoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cat_tamanopaquetes_tamanoid_seq', 5, true);


--
-- TOC entry 5571 (class 0 OID 0)
-- Dependencies: 221
-- Name: categorias_categoriaid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.categorias_categoriaid_seq', 1, true);


--
-- TOC entry 5572 (class 0 OID 0)
-- Dependencies: 290
-- Name: cliente_creditos_credito_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cliente_creditos_credito_id_seq', 1, false);


--
-- TOC entry 5573 (class 0 OID 0)
-- Dependencies: 231
-- Name: cliente_direcciones_direccionid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cliente_direcciones_direccionid_seq', 1, false);


--
-- TOC entry 5574 (class 0 OID 0)
-- Dependencies: 217
-- Name: clientes_clienteid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.clientes_clienteid_seq', 1, true);


--
-- TOC entry 5575 (class 0 OID 0)
-- Dependencies: 237
-- Name: comisiones_comisionid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.comisiones_comisionid_seq', 1, false);


--
-- TOC entry 5576 (class 0 OID 0)
-- Dependencies: 255
-- Name: communicationlogs_logid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.communicationlogs_logid_seq', 1, false);


--
-- TOC entry 5577 (class 0 OID 0)
-- Dependencies: 271
-- Name: control_cambios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.control_cambios_id_seq', 1, false);


--
-- TOC entry 5578 (class 0 OID 0)
-- Dependencies: 292
-- Name: credito_movimientos_movimiento_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.credito_movimientos_movimiento_id_seq', 1, false);


--
-- TOC entry 5579 (class 0 OID 0)
-- Dependencies: 281
-- Name: cuentas_por_pagar_cxp_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cuentas_por_pagar_cxp_id_seq', 1, false);


--
-- TOC entry 5580 (class 0 OID 0)
-- Dependencies: 287
-- Name: cxp_etiquetas_asignadas_asignacion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.cxp_etiquetas_asignadas_asignacion_id_seq', 1, false);


--
-- TOC entry 5581 (class 0 OID 0)
-- Dependencies: 235
-- Name: detallesdelpedido_detalleid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.detallesdelpedido_detalleid_seq', 1, false);


--
-- TOC entry 5582 (class 0 OID 0)
-- Dependencies: 247
-- Name: detallesordencompra_detalleoc_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.detallesordencompra_detalleoc_id_seq', 1, false);


--
-- TOC entry 5583 (class 0 OID 0)
-- Dependencies: 259
-- Name: estados_estadoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.estados_estadoid_seq', 32, true);


--
-- TOC entry 5584 (class 0 OID 0)
-- Dependencies: 229
-- Name: itemsdelcarrito_itemid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.itemsdelcarrito_itemid_seq', 1, false);


--
-- TOC entry 5585 (class 0 OID 0)
-- Dependencies: 261
-- Name: log_eventosusuario_eventoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.log_eventosusuario_eventoid_seq', 1, false);


--
-- TOC entry 5586 (class 0 OID 0)
-- Dependencies: 239
-- Name: log_inventario_logid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.log_inventario_logid_seq', 1, false);


--
-- TOC entry 5587 (class 0 OID 0)
-- Dependencies: 269
-- Name: log_movimientos_logid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.log_movimientos_logid_seq', 1, true);


--
-- TOC entry 5588 (class 0 OID 0)
-- Dependencies: 251
-- Name: medidas_medidaid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.medidas_medidaid_seq', 1, false);


--
-- TOC entry 5589 (class 0 OID 0)
-- Dependencies: 266
-- Name: notificaciones_notificacionid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.notificaciones_notificacionid_seq', 1, false);


--
-- TOC entry 5590 (class 0 OID 0)
-- Dependencies: 245
-- Name: ordenesdecompra_ordencompraid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.ordenesdecompra_ordencompraid_seq', 1, false);


--
-- TOC entry 5591 (class 0 OID 0)
-- Dependencies: 283
-- Name: pagos_cxp_pago_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.pagos_cxp_pago_id_seq', 1, false);


--
-- TOC entry 5592 (class 0 OID 0)
-- Dependencies: 257
-- Name: passwordresettokens_tokenid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.passwordresettokens_tokenid_seq', 1, false);


--
-- TOC entry 5593 (class 0 OID 0)
-- Dependencies: 233
-- Name: pedidos_pedidoid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pedidos_pedidoid_seq', 1, false);


--
-- TOC entry 5594 (class 0 OID 0)
-- Dependencies: 225
-- Name: producto_imagenes_imagenid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.producto_imagenes_imagenid_seq', 1, false);


--
-- TOC entry 5595 (class 0 OID 0)
-- Dependencies: 280
-- Name: producto_variante_imagenes_imagenid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.producto_variante_imagenes_imagenid_seq', 1, false);


--
-- TOC entry 5596 (class 0 OID 0)
-- Dependencies: 223
-- Name: producto_variantes_varianteid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.producto_variantes_varianteid_seq', 1, false);


--
-- TOC entry 5597 (class 0 OID 0)
-- Dependencies: 253
-- Name: productos_productoid_seq1; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.productos_productoid_seq1', 1, false);


--
-- TOC entry 5598 (class 0 OID 0)
-- Dependencies: 273
-- Name: proveedor_reglas_empaque_reglaid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.proveedor_reglas_empaque_reglaid_seq', 1, false);


--
-- TOC entry 5599 (class 0 OID 0)
-- Dependencies: 243
-- Name: proveedores_proveedorid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.proveedores_proveedorid_seq', 1, false);


--
-- TOC entry 5600 (class 0 OID 0)
-- Dependencies: 294
-- Name: solicitudes_credito_solicitud_id_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.solicitudes_credito_solicitud_id_seq', 1, false);


--
-- TOC entry 5601 (class 0 OID 0)
-- Dependencies: 249
-- Name: tipoproducto_tipoproductoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.tipoproducto_tipoproductoid_seq', 4, true);


--
-- TOC entry 5602 (class 0 OID 0)
-- Dependencies: 277
-- Name: toma_inventario_conteos_conteoid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.toma_inventario_conteos_conteoid_seq', 1, false);


--
-- TOC entry 5603 (class 0 OID 0)
-- Dependencies: 275
-- Name: toma_inventario_sesiones_sesionid_seq; Type: SEQUENCE SET; Schema: public; Owner: ferram
--

SELECT pg_catalog.setval('public.toma_inventario_sesiones_sesionid_seq', 1, false);


--
-- TOC entry 5123 (class 2606 OID 17412)
-- Name: administradores administradores_email_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.administradores
    ADD CONSTRAINT administradores_email_key UNIQUE (email);


--
-- TOC entry 5125 (class 2606 OID 17410)
-- Name: administradores administradores_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.administradores
    ADD CONSTRAINT administradores_pkey PRIMARY KEY (adminid);


--
-- TOC entry 5088 (class 2606 OID 17234)
-- Name: agentesdeventas agentesdeventas_codigoagente_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agentesdeventas
    ADD CONSTRAINT agentesdeventas_codigoagente_key UNIQUE (codigoagente);


--
-- TOC entry 5090 (class 2606 OID 17232)
-- Name: agentesdeventas agentesdeventas_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agentesdeventas
    ADD CONSTRAINT agentesdeventas_email_key UNIQUE (email);


--
-- TOC entry 5092 (class 2606 OID 17230)
-- Name: agentesdeventas agentesdeventas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agentesdeventas
    ADD CONSTRAINT agentesdeventas_pkey PRIMARY KEY (agenteid);


--
-- TOC entry 5106 (class 2606 OID 17288)
-- Name: carritodecompra carritodecompra_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.carritodecompra
    ADD CONSTRAINT carritodecompra_pkey PRIMARY KEY (carritoid);


--
-- TOC entry 5213 (class 2606 OID 34179)
-- Name: cat_cxp_etiquetas cat_cxp_etiquetas_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_cxp_etiquetas
    ADD CONSTRAINT cat_cxp_etiquetas_pkey PRIMARY KEY (etiqueta_id);


--
-- TOC entry 5166 (class 2606 OID 25447)
-- Name: cat_tamanopaquetes cat_tamanopaquetes_cantidad_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_tamanopaquetes
    ADD CONSTRAINT cat_tamanopaquetes_cantidad_key UNIQUE (cantidad);


--
-- TOC entry 5168 (class 2606 OID 25445)
-- Name: cat_tamanopaquetes cat_tamanopaquetes_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cat_tamanopaquetes
    ADD CONSTRAINT cat_tamanopaquetes_pkey PRIMARY KEY (tamanoid);


--
-- TOC entry 5094 (class 2606 OID 17243)
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (categoriaid);


--
-- TOC entry 5219 (class 2606 OID 34533)
-- Name: cliente_creditos cliente_creditos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_creditos
    ADD CONSTRAINT cliente_creditos_pkey PRIMARY KEY (credito_id);


--
-- TOC entry 5110 (class 2606 OID 17319)
-- Name: cliente_direcciones cliente_direcciones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cliente_direcciones
    ADD CONSTRAINT cliente_direcciones_pkey PRIMARY KEY (direccionid);


--
-- TOC entry 5081 (class 2606 OID 17220)
-- Name: clientes clientes_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_email_key UNIQUE (email);


--
-- TOC entry 5083 (class 2606 OID 33680)
-- Name: clientes clientes_google_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_google_id_key UNIQUE (google_id);


--
-- TOC entry 5085 (class 2606 OID 17218)
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (clienteid);


--
-- TOC entry 5116 (class 2606 OID 17374)
-- Name: comisiones comisiones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_pkey PRIMARY KEY (comisionid);


--
-- TOC entry 5148 (class 2606 OID 17560)
-- Name: communicationlogs communicationlogs_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT communicationlogs_pkey PRIMARY KEY (logid);


--
-- TOC entry 5184 (class 2606 OID 33707)
-- Name: control_cambios control_cambios_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.control_cambios
    ADD CONSTRAINT control_cambios_pkey PRIMARY KEY (id);


--
-- TOC entry 5223 (class 2606 OID 34550)
-- Name: credito_movimientos credito_movimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.credito_movimientos
    ADD CONSTRAINT credito_movimientos_pkey PRIMARY KEY (movimiento_id);


--
-- TOC entry 5202 (class 2606 OID 34134)
-- Name: cuentas_por_pagar cuentas_por_pagar_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT cuentas_por_pagar_pkey PRIMARY KEY (cxp_id);


--
-- TOC entry 5215 (class 2606 OID 34189)
-- Name: cxp_etiquetas_asignadas cxp_etiquetas_asignadas_cxp_id_etiqueta_id_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cxp_etiquetas_asignadas
    ADD CONSTRAINT cxp_etiquetas_asignadas_cxp_id_etiqueta_id_key UNIQUE (cxp_id, etiqueta_id);


--
-- TOC entry 5217 (class 2606 OID 34187)
-- Name: cxp_etiquetas_asignadas cxp_etiquetas_asignadas_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cxp_etiquetas_asignadas
    ADD CONSTRAINT cxp_etiquetas_asignadas_pkey PRIMARY KEY (asignacion_id);


--
-- TOC entry 5114 (class 2606 OID 17355)
-- Name: detallesdelpedido detallesdelpedido_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT detallesdelpedido_pkey PRIMARY KEY (detalleid);


--
-- TOC entry 5132 (class 2606 OID 17443)
-- Name: detallesordencompra detallesordencompra_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra
    ADD CONSTRAINT detallesordencompra_pkey PRIMARY KEY (detalleoc_id);


--
-- TOC entry 5154 (class 2606 OID 25409)
-- Name: estados estados_abreviatura_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados
    ADD CONSTRAINT estados_abreviatura_key UNIQUE (abreviatura);


--
-- TOC entry 5156 (class 2606 OID 25407)
-- Name: estados estados_nombre_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados
    ADD CONSTRAINT estados_nombre_key UNIQUE (nombre);


--
-- TOC entry 5158 (class 2606 OID 25405)
-- Name: estados estados_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.estados
    ADD CONSTRAINT estados_pkey PRIMARY KEY (estadoid);


--
-- TOC entry 5108 (class 2606 OID 17300)
-- Name: itemsdelcarrito itemsdelcarrito_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT itemsdelcarrito_pkey PRIMARY KEY (itemid);


--
-- TOC entry 5164 (class 2606 OID 25424)
-- Name: log_eventosusuario log_eventosusuario_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario
    ADD CONSTRAINT log_eventosusuario_pkey PRIMARY KEY (eventoid);


--
-- TOC entry 5121 (class 2606 OID 17392)
-- Name: log_inventario log_inventario_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.log_inventario
    ADD CONSTRAINT log_inventario_pkey PRIMARY KEY (logid);


--
-- TOC entry 5182 (class 2606 OID 25551)
-- Name: log_movimientos log_movimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_movimientos
    ADD CONSTRAINT log_movimientos_pkey PRIMARY KEY (logid);


--
-- TOC entry 5139 (class 2606 OID 17477)
-- Name: medidas medidas_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas
    ADD CONSTRAINT medidas_pkey PRIMARY KEY (medidaid);


--
-- TOC entry 5141 (class 2606 OID 17479)
-- Name: medidas medidas_tipoproductoid_nombremedida_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas
    ADD CONSTRAINT medidas_tipoproductoid_nombremedida_key UNIQUE (tipoproductoid, nombremedida);


--
-- TOC entry 5176 (class 2606 OID 25521)
-- Name: notificaciones notificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_pkey PRIMARY KEY (notificacionid);


--
-- TOC entry 5130 (class 2606 OID 17430)
-- Name: ordenesdecompra ordenesdecompra_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.ordenesdecompra
    ADD CONSTRAINT ordenesdecompra_pkey PRIMARY KEY (ordencompraid);


--
-- TOC entry 5211 (class 2606 OID 34159)
-- Name: pagos_cxp pagos_cxp_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_cxp
    ADD CONSTRAINT pagos_cxp_pkey PRIMARY KEY (pago_id);


--
-- TOC entry 5150 (class 2606 OID 17584)
-- Name: passwordresettokens passwordresettokens_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT passwordresettokens_pkey PRIMARY KEY (tokenid);


--
-- TOC entry 5152 (class 2606 OID 17586)
-- Name: passwordresettokens passwordresettokens_token_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT passwordresettokens_token_key UNIQUE (token);


--
-- TOC entry 5112 (class 2606 OID 17333)
-- Name: pedidos pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_pkey PRIMARY KEY (pedidoid);


--
-- TOC entry 5104 (class 2606 OID 17275)
-- Name: producto_imagenes producto_imagenes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_imagenes
    ADD CONSTRAINT producto_imagenes_pkey PRIMARY KEY (imagenid);


--
-- TOC entry 5170 (class 2606 OID 25452)
-- Name: producto_tamanosdisponibles producto_tamanosdisponibles_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_tamanosdisponibles
    ADD CONSTRAINT producto_tamanosdisponibles_pkey PRIMARY KEY (productoid, tamanoid);


--
-- TOC entry 5200 (class 2606 OID 34104)
-- Name: producto_variante_imagenes producto_variante_imagenes_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variante_imagenes
    ADD CONSTRAINT producto_variante_imagenes_pkey PRIMARY KEY (imagenid);


--
-- TOC entry 5100 (class 2606 OID 17258)
-- Name: producto_variantes productos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_pkey PRIMARY KEY (varianteid);


--
-- TOC entry 5144 (class 2606 OID 17506)
-- Name: productos productos_pkey1; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey1 PRIMARY KEY (productoid);


--
-- TOC entry 5102 (class 2606 OID 17260)
-- Name: producto_variantes productos_sku_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_sku_key UNIQUE (sku);


--
-- TOC entry 5146 (class 2606 OID 33716)
-- Name: productos productos_sku_maestro_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_sku_maestro_key UNIQUE (sku_maestro);


--
-- TOC entry 5188 (class 2606 OID 33729)
-- Name: proveedor_reglas_empaque proveedor_reglas_empaque_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedor_reglas_empaque
    ADD CONSTRAINT proveedor_reglas_empaque_pkey PRIMARY KEY (reglaid);


--
-- TOC entry 5127 (class 2606 OID 17421)
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (proveedorid);


--
-- TOC entry 5225 (class 2606 OID 34569)
-- Name: solicitudes_credito solicitudes_credito_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.solicitudes_credito
    ADD CONSTRAINT solicitudes_credito_pkey PRIMARY KEY (solicitud_id);


--
-- TOC entry 5134 (class 2606 OID 17466)
-- Name: tipoproducto tipoproducto_nombre_key; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.tipoproducto
    ADD CONSTRAINT tipoproducto_nombre_key UNIQUE (nombre);


--
-- TOC entry 5136 (class 2606 OID 17464)
-- Name: tipoproducto tipoproducto_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.tipoproducto
    ADD CONSTRAINT tipoproducto_pkey PRIMARY KEY (tipoproductoid);


--
-- TOC entry 5194 (class 2606 OID 33795)
-- Name: toma_inventario_conteos toma_inventario_conteos_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_conteos
    ADD CONSTRAINT toma_inventario_conteos_pkey PRIMARY KEY (conteoid);


--
-- TOC entry 5190 (class 2606 OID 33781)
-- Name: toma_inventario_sesiones toma_inventario_sesiones_pkey; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_sesiones
    ADD CONSTRAINT toma_inventario_sesiones_pkey PRIMARY KEY (sesionid);


--
-- TOC entry 5221 (class 2606 OID 34535)
-- Name: cliente_creditos unique_cliente_credito; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_creditos
    ADD CONSTRAINT unique_cliente_credito UNIQUE (cliente_id);


--
-- TOC entry 5208 (class 2606 OID 34214)
-- Name: cuentas_por_pagar unq_orden_referencia; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT unq_orden_referencia UNIQUE (orden_compra_id, referencia_factura);


--
-- TOC entry 5196 (class 2606 OID 33797)
-- Name: toma_inventario_conteos unq_sesion_variante; Type: CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_conteos
    ADD CONSTRAINT unq_sesion_variante UNIQUE (sesionid, varianteid);


--
-- TOC entry 5095 (class 1259 OID 25506)
-- Name: idx_categoria_activo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_categoria_activo ON public.categorias USING btree (activo);


--
-- TOC entry 5086 (class 1259 OID 25478)
-- Name: idx_cliente_agente; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cliente_agente ON public.clientes USING btree (agenteid);


--
-- TOC entry 5191 (class 1259 OID 33809)
-- Name: idx_conteos_estatus; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_conteos_estatus ON public.toma_inventario_conteos USING btree (estatus_fila);


--
-- TOC entry 5192 (class 1259 OID 33808)
-- Name: idx_conteos_sesion; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_conteos_sesion ON public.toma_inventario_conteos USING btree (sesionid);


--
-- TOC entry 5185 (class 1259 OID 33709)
-- Name: idx_control_cambios_entidad; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_control_cambios_entidad ON public.control_cambios USING btree (entidad, entidad_id);


--
-- TOC entry 5186 (class 1259 OID 33708)
-- Name: idx_control_cambios_estado; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_control_cambios_estado ON public.control_cambios USING btree (estado);


--
-- TOC entry 5203 (class 1259 OID 34146)
-- Name: idx_cxp_estatus; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cxp_estatus ON public.cuentas_por_pagar USING btree (estatus);


--
-- TOC entry 5204 (class 1259 OID 34219)
-- Name: idx_cxp_fecha_cierre; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cxp_fecha_cierre ON public.cuentas_por_pagar USING btree (fecha_cierre);


--
-- TOC entry 5205 (class 1259 OID 34145)
-- Name: idx_cxp_proveedor; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cxp_proveedor ON public.cuentas_por_pagar USING btree (proveedor_id);


--
-- TOC entry 5206 (class 1259 OID 34147)
-- Name: idx_cxp_vencimiento; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_cxp_vencimiento ON public.cuentas_por_pagar USING btree (fecha_vencimiento);


--
-- TOC entry 5177 (class 1259 OID 25558)
-- Name: idx_log_accion; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_accion ON public.log_movimientos USING btree (accion);


--
-- TOC entry 5159 (class 1259 OID 25436)
-- Name: idx_log_clienteid; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_clienteid ON public.log_eventosusuario USING btree (clienteid);


--
-- TOC entry 5178 (class 1259 OID 25560)
-- Name: idx_log_entidad; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_entidad ON public.log_movimientos USING btree (entidad, entidadid);


--
-- TOC entry 5179 (class 1259 OID 25557)
-- Name: idx_log_fecha; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_fecha ON public.log_movimientos USING btree (fecha DESC);


--
-- TOC entry 5117 (class 1259 OID 34205)
-- Name: idx_log_inventario_cxp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_log_inventario_cxp ON public.log_inventario USING btree (cxp_id);


--
-- TOC entry 5118 (class 1259 OID 34218)
-- Name: idx_log_inventario_cxp_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_log_inventario_cxp_id ON public.log_inventario USING btree (cxp_id);


--
-- TOC entry 5119 (class 1259 OID 33755)
-- Name: idx_log_inventario_excepcion; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_log_inventario_excepcion ON public.log_inventario USING btree (es_excepcion);


--
-- TOC entry 5160 (class 1259 OID 25438)
-- Name: idx_log_timestamp; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_timestamp ON public.log_eventosusuario USING btree ("timestamp");


--
-- TOC entry 5161 (class 1259 OID 25435)
-- Name: idx_log_tipoevento; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_tipoevento ON public.log_eventosusuario USING btree (tipoevento);


--
-- TOC entry 5180 (class 1259 OID 25559)
-- Name: idx_log_usuario; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_usuario ON public.log_movimientos USING btree (usuarioid);


--
-- TOC entry 5162 (class 1259 OID 25437)
-- Name: idx_log_varianteid; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_log_varianteid ON public.log_eventosusuario USING btree (varianteid);


--
-- TOC entry 5137 (class 1259 OID 17495)
-- Name: idx_medidas_tipoproducto; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_medidas_tipoproducto ON public.medidas USING btree (tipoproductoid);


--
-- TOC entry 5171 (class 1259 OID 25527)
-- Name: idx_notificaciones_clienteid; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_clienteid ON public.notificaciones USING btree (clienteid);


--
-- TOC entry 5172 (class 1259 OID 25530)
-- Name: idx_notificaciones_fecha; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_fecha ON public.notificaciones USING btree (fechacreacion DESC);


--
-- TOC entry 5173 (class 1259 OID 25528)
-- Name: idx_notificaciones_leida; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_leida ON public.notificaciones USING btree (leida);


--
-- TOC entry 5174 (class 1259 OID 25529)
-- Name: idx_notificaciones_tipo; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_notificaciones_tipo ON public.notificaciones USING btree (tipo);


--
-- TOC entry 5128 (class 1259 OID 25490)
-- Name: idx_ordenesdecompra_origenoc; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_ordenesdecompra_origenoc ON public.ordenesdecompra USING btree (origenoc);


--
-- TOC entry 5209 (class 1259 OID 34170)
-- Name: idx_pagos_historial; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_pagos_historial ON public.pagos_cxp USING btree (cxp_id);


--
-- TOC entry 5142 (class 1259 OID 25505)
-- Name: idx_producto_activo; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_producto_activo ON public.productos USING btree (activo);


--
-- TOC entry 5096 (class 1259 OID 25487)
-- Name: idx_producto_oferta; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_producto_oferta ON public.producto_variantes USING btree (precioofertaunitario) WHERE (precioofertaunitario IS NOT NULL);


--
-- TOC entry 5197 (class 1259 OID 34110)
-- Name: idx_producto_variante_imagenes_varianteid; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_producto_variante_imagenes_varianteid ON public.producto_variante_imagenes USING btree (varianteid);


--
-- TOC entry 5198 (class 1259 OID 34111)
-- Name: idx_producto_variante_imagenes_varianteid_orden; Type: INDEX; Schema: public; Owner: ferram
--

CREATE INDEX idx_producto_variante_imagenes_varianteid_orden ON public.producto_variante_imagenes USING btree (varianteid, orden);


--
-- TOC entry 5097 (class 1259 OID 17496)
-- Name: idx_productos_tipoproducto; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_productos_tipoproducto ON public.producto_variantes USING btree (tipoproductoid);


--
-- TOC entry 5098 (class 1259 OID 34094)
-- Name: idx_variantes_color_nombre; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_variantes_color_nombre ON public.producto_variantes USING btree (color_nombre);


--
-- TOC entry 5284 (class 2620 OID 25533)
-- Name: notificaciones trigger_limitar_notificaciones; Type: TRIGGER; Schema: public; Owner: ferram
--

CREATE TRIGGER trigger_limitar_notificaciones AFTER INSERT ON public.notificaciones FOR EACH ROW EXECUTE FUNCTION public.limitar_notificaciones_por_cliente();


--
-- TOC entry 5285 (class 2620 OID 34557)
-- Name: cliente_creditos trigger_update_credito_fecha; Type: TRIGGER; Schema: public; Owner: ferram
--

CREATE TRIGGER trigger_update_credito_fecha BEFORE UPDATE ON public.cliente_creditos FOR EACH ROW EXECUTE FUNCTION public.update_ultima_actualizacion();


--
-- TOC entry 5232 (class 2606 OID 17289)
-- Name: carritodecompra carritodecompra_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.carritodecompra
    ADD CONSTRAINT carritodecompra_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 5227 (class 2606 OID 17244)
-- Name: categorias categorias_parentcategoriaid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_parentcategoriaid_fkey FOREIGN KEY (parentcategoriaid) REFERENCES public.categorias(categoriaid);


--
-- TOC entry 5236 (class 2606 OID 17320)
-- Name: cliente_direcciones cliente_direcciones_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cliente_direcciones
    ADD CONSTRAINT cliente_direcciones_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 5244 (class 2606 OID 17380)
-- Name: comisiones comisiones_agenteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_agenteid_fkey FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid);


--
-- TOC entry 5245 (class 2606 OID 17375)
-- Name: comisiones comisiones_pedidoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comisiones
    ADD CONSTRAINT comisiones_pedidoid_fkey FOREIGN KEY (pedidoid) REFERENCES public.pedidos(pedidoid);


--
-- TOC entry 5275 (class 2606 OID 34140)
-- Name: cuentas_por_pagar cuentas_por_pagar_orden_compra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT cuentas_por_pagar_orden_compra_id_fkey FOREIGN KEY (orden_compra_id) REFERENCES public.ordenesdecompra(ordencompraid);


--
-- TOC entry 5276 (class 2606 OID 34135)
-- Name: cuentas_por_pagar cuentas_por_pagar_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cuentas_por_pagar
    ADD CONSTRAINT cuentas_por_pagar_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 5279 (class 2606 OID 34190)
-- Name: cxp_etiquetas_asignadas cxp_etiquetas_asignadas_cxp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cxp_etiquetas_asignadas
    ADD CONSTRAINT cxp_etiquetas_asignadas_cxp_id_fkey FOREIGN KEY (cxp_id) REFERENCES public.cuentas_por_pagar(cxp_id) ON DELETE CASCADE;


--
-- TOC entry 5280 (class 2606 OID 34195)
-- Name: cxp_etiquetas_asignadas cxp_etiquetas_asignadas_etiqueta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cxp_etiquetas_asignadas
    ADD CONSTRAINT cxp_etiquetas_asignadas_etiqueta_id_fkey FOREIGN KEY (etiqueta_id) REFERENCES public.cat_cxp_etiquetas(etiqueta_id);


--
-- TOC entry 5241 (class 2606 OID 17356)
-- Name: detallesdelpedido detallesdelpedido_pedidoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT detallesdelpedido_pedidoid_fkey FOREIGN KEY (pedidoid) REFERENCES public.pedidos(pedidoid);


--
-- TOC entry 5250 (class 2606 OID 17444)
-- Name: detallesordencompra detallesordencompra_ordencompraid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra
    ADD CONSTRAINT detallesordencompra_ordencompraid_fkey FOREIGN KEY (ordencompraid) REFERENCES public.ordenesdecompra(ordencompraid);


--
-- TOC entry 5256 (class 2606 OID 17566)
-- Name: communicationlogs fk_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT fk_cliente FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 5226 (class 2606 OID 25473)
-- Name: clientes fk_cliente_agente; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT fk_cliente_agente FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid);


--
-- TOC entry 5281 (class 2606 OID 34536)
-- Name: cliente_creditos fk_cliente_credito; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.cliente_creditos
    ADD CONSTRAINT fk_cliente_credito FOREIGN KEY (cliente_id) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 5237 (class 2606 OID 25410)
-- Name: cliente_direcciones fk_cliente_estado; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cliente_direcciones
    ADD CONSTRAINT fk_cliente_estado FOREIGN KEY (estadoid) REFERENCES public.estados(estadoid);


--
-- TOC entry 5242 (class 2606 OID 25463)
-- Name: detallesdelpedido fk_detalles_tamano; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT fk_detalles_tamano FOREIGN KEY (tamanoid) REFERENCES public.cat_tamanopaquetes(tamanoid);


--
-- TOC entry 5243 (class 2606 OID 17518)
-- Name: detallesdelpedido fk_detallesdelpedido_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detallesdelpedido
    ADD CONSTRAINT fk_detallesdelpedido_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 5251 (class 2606 OID 17538)
-- Name: detallesordencompra fk_detallesordencompra_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.detallesordencompra
    ADD CONSTRAINT fk_detallesordencompra_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 5231 (class 2606 OID 25499)
-- Name: producto_imagenes fk_imagen_producto_maestro; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_imagenes
    ADD CONSTRAINT fk_imagen_producto_maestro FOREIGN KEY (productoid) REFERENCES public.productos(productoid) ON DELETE CASCADE;


--
-- TOC entry 5233 (class 2606 OID 25468)
-- Name: itemsdelcarrito fk_items_tamano; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT fk_items_tamano FOREIGN KEY (tamanoid) REFERENCES public.cat_tamanopaquetes(tamanoid);


--
-- TOC entry 5234 (class 2606 OID 17523)
-- Name: itemsdelcarrito fk_itemsdelcarrito_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT fk_itemsdelcarrito_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 5261 (class 2606 OID 25425)
-- Name: log_eventosusuario fk_log_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario
    ADD CONSTRAINT fk_log_cliente FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 5268 (class 2606 OID 25552)
-- Name: log_movimientos fk_log_usuario; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_movimientos
    ADD CONSTRAINT fk_log_usuario FOREIGN KEY (usuarioid) REFERENCES public.administradores(adminid) ON DELETE SET NULL;


--
-- TOC entry 5262 (class 2606 OID 25430)
-- Name: log_eventosusuario fk_log_variante; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.log_eventosusuario
    ADD CONSTRAINT fk_log_variante FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 5246 (class 2606 OID 17533)
-- Name: log_inventario fk_loginventario_varianteid; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.log_inventario
    ADD CONSTRAINT fk_loginventario_varianteid FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 5282 (class 2606 OID 34551)
-- Name: credito_movimientos fk_movimiento_credito; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.credito_movimientos
    ADD CONSTRAINT fk_movimiento_credito FOREIGN KEY (credito_id) REFERENCES public.cliente_creditos(credito_id) ON DELETE CASCADE;


--
-- TOC entry 5277 (class 2606 OID 34160)
-- Name: pagos_cxp fk_pagos_cxp; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_cxp
    ADD CONSTRAINT fk_pagos_cxp FOREIGN KEY (cxp_id) REFERENCES public.cuentas_por_pagar(cxp_id) ON DELETE CASCADE;


--
-- TOC entry 5278 (class 2606 OID 34165)
-- Name: pagos_cxp fk_pagos_usuario; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.pagos_cxp
    ADD CONSTRAINT fk_pagos_usuario FOREIGN KEY (usuario_id) REFERENCES public.administradores(adminid);


--
-- TOC entry 5259 (class 2606 OID 17592)
-- Name: passwordresettokens fk_passwordreset_agente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT fk_passwordreset_agente FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid) ON DELETE CASCADE;


--
-- TOC entry 5260 (class 2606 OID 17587)
-- Name: passwordresettokens fk_passwordreset_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.passwordresettokens
    ADD CONSTRAINT fk_passwordreset_cliente FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 5257 (class 2606 OID 17561)
-- Name: communicationlogs fk_pedido; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT fk_pedido FOREIGN KEY (pedidoid) REFERENCES public.pedidos(pedidoid);


--
-- TOC entry 5228 (class 2606 OID 17512)
-- Name: producto_variantes fk_producto_maestro; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT fk_producto_maestro FOREIGN KEY (productoid) REFERENCES public.productos(productoid);


--
-- TOC entry 5253 (class 2606 OID 33717)
-- Name: productos fk_producto_tipo; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT fk_producto_tipo FOREIGN KEY (tipoproductoid) REFERENCES public.tipoproducto(tipoproductoid);


--
-- TOC entry 5258 (class 2606 OID 17571)
-- Name: communicationlogs fk_proveedor; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.communicationlogs
    ADD CONSTRAINT fk_proveedor FOREIGN KEY (proveedorid) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 5254 (class 2606 OID 25480)
-- Name: productos fk_proveedor_default; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT fk_proveedor_default FOREIGN KEY (proveedorid_default) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 5269 (class 2606 OID 33732)
-- Name: proveedor_reglas_empaque fk_regla_proveedor; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedor_reglas_empaque
    ADD CONSTRAINT fk_regla_proveedor FOREIGN KEY (proveedorid) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 5270 (class 2606 OID 33737)
-- Name: proveedor_reglas_empaque fk_regla_tipo; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.proveedor_reglas_empaque
    ADD CONSTRAINT fk_regla_tipo FOREIGN KEY (tipoproductoid) REFERENCES public.tipoproducto(tipoproductoid);


--
-- TOC entry 5283 (class 2606 OID 34570)
-- Name: solicitudes_credito fk_solicitud_cliente; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.solicitudes_credito
    ADD CONSTRAINT fk_solicitud_cliente FOREIGN KEY (cliente_id) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 5263 (class 2606 OID 25453)
-- Name: producto_tamanosdisponibles fk_tamanos_producto; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_tamanosdisponibles
    ADD CONSTRAINT fk_tamanos_producto FOREIGN KEY (productoid) REFERENCES public.productos(productoid);


--
-- TOC entry 5264 (class 2606 OID 25458)
-- Name: producto_tamanosdisponibles fk_tamanos_tamano; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_tamanosdisponibles
    ADD CONSTRAINT fk_tamanos_tamano FOREIGN KEY (tamanoid) REFERENCES public.cat_tamanopaquetes(tamanoid);


--
-- TOC entry 5235 (class 2606 OID 17543)
-- Name: itemsdelcarrito itemsdelcarrito_carritoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.itemsdelcarrito
    ADD CONSTRAINT itemsdelcarrito_carritoid_fkey FOREIGN KEY (carritoid) REFERENCES public.carritodecompra(carritoid);


--
-- TOC entry 5247 (class 2606 OID 34200)
-- Name: log_inventario log_inventario_cxp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.log_inventario
    ADD CONSTRAINT log_inventario_cxp_id_fkey FOREIGN KEY (cxp_id) REFERENCES public.cuentas_por_pagar(cxp_id) ON DELETE SET NULL;


--
-- TOC entry 5252 (class 2606 OID 17480)
-- Name: medidas medidas_tipoproductoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.medidas
    ADD CONSTRAINT medidas_tipoproductoid_fkey FOREIGN KEY (tipoproductoid) REFERENCES public.tipoproducto(tipoproductoid);


--
-- TOC entry 5265 (class 2606 OID 33743)
-- Name: notificaciones notificaciones_administrador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_administrador_id_fkey FOREIGN KEY (administrador_id) REFERENCES public.administradores(adminid) ON DELETE CASCADE;


--
-- TOC entry 5266 (class 2606 OID 33748)
-- Name: notificaciones notificaciones_agente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_agente_id_fkey FOREIGN KEY (agente_id) REFERENCES public.agentesdeventas(agenteid) ON DELETE CASCADE;


--
-- TOC entry 5267 (class 2606 OID 25522)
-- Name: notificaciones notificaciones_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid) ON DELETE CASCADE;


--
-- TOC entry 5248 (class 2606 OID 17431)
-- Name: ordenesdecompra ordenesdecompra_proveedorid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.ordenesdecompra
    ADD CONSTRAINT ordenesdecompra_proveedorid_fkey FOREIGN KEY (proveedorid) REFERENCES public.proveedores(proveedorid);


--
-- TOC entry 5249 (class 2606 OID 33949)
-- Name: ordenesdecompra ordenesdecompra_usuario_creador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.ordenesdecompra
    ADD CONSTRAINT ordenesdecompra_usuario_creador_id_fkey FOREIGN KEY (usuario_creador_id) REFERENCES public.administradores(adminid);


--
-- TOC entry 5238 (class 2606 OID 17339)
-- Name: pedidos pedidos_agenteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_agenteid_fkey FOREIGN KEY (agenteid) REFERENCES public.agentesdeventas(agenteid);


--
-- TOC entry 5239 (class 2606 OID 17334)
-- Name: pedidos pedidos_clienteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_clienteid_fkey FOREIGN KEY (clienteid) REFERENCES public.clientes(clienteid);


--
-- TOC entry 5240 (class 2606 OID 17344)
-- Name: pedidos pedidos_direccionenvioid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_direccionenvioid_fkey FOREIGN KEY (direccionenvioid) REFERENCES public.cliente_direcciones(direccionid);


--
-- TOC entry 5274 (class 2606 OID 34105)
-- Name: producto_variante_imagenes producto_variante_imagenes_varianteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.producto_variante_imagenes
    ADD CONSTRAINT producto_variante_imagenes_varianteid_fkey FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid) ON DELETE CASCADE;


--
-- TOC entry 5255 (class 2606 OID 17507)
-- Name: productos productos_categoriaid_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_categoriaid_fkey1 FOREIGN KEY (categoriaid) REFERENCES public.categorias(categoriaid);


--
-- TOC entry 5229 (class 2606 OID 17490)
-- Name: producto_variantes productos_medidaid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_medidaid_fkey FOREIGN KEY (medidaid) REFERENCES public.medidas(medidaid);


--
-- TOC entry 5230 (class 2606 OID 17485)
-- Name: producto_variantes productos_tipoproductoid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.producto_variantes
    ADD CONSTRAINT productos_tipoproductoid_fkey FOREIGN KEY (tipoproductoid) REFERENCES public.tipoproducto(tipoproductoid);


--
-- TOC entry 5272 (class 2606 OID 33798)
-- Name: toma_inventario_conteos toma_inventario_conteos_sesionid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_conteos
    ADD CONSTRAINT toma_inventario_conteos_sesionid_fkey FOREIGN KEY (sesionid) REFERENCES public.toma_inventario_sesiones(sesionid) ON DELETE CASCADE;


--
-- TOC entry 5273 (class 2606 OID 33803)
-- Name: toma_inventario_conteos toma_inventario_conteos_varianteid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_conteos
    ADD CONSTRAINT toma_inventario_conteos_varianteid_fkey FOREIGN KEY (varianteid) REFERENCES public.producto_variantes(varianteid);


--
-- TOC entry 5271 (class 2606 OID 33782)
-- Name: toma_inventario_sesiones toma_inventario_sesiones_usuario_creador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ferram
--

ALTER TABLE ONLY public.toma_inventario_sesiones
    ADD CONSTRAINT toma_inventario_sesiones_usuario_creador_id_fkey FOREIGN KEY (usuario_creador_id) REFERENCES public.administradores(adminid);


-- Completed on 2025-12-19 23:11:42

--
-- PostgreSQL database dump complete
--

