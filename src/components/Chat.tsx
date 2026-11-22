import { useState, useEffect, useRef } from 'react';
import { storage } from '../utils/storage';
import { playKeySound } from '../utils/animations';
import { QuizAnswer } from '../types/quiz';
import { getCompletionBadge } from '../utils/contentByGender';
import { ga4Tracking } from '../utils/ga4Tracking';

interface ChatProps {
  onNavigate: (page: string) => void;
}

interface Message {
  type: 'bot' | 'user';
  text: string;
  isTyping?: boolean;
}

interface Question {
  id: number;
  text: string;
  options: string[];
  response: string;
  responseByOption?: {
    [option: string]: string;
  };
  dataKey: 'gender' | 'timeSeparation' | 'whoEnded' | 'relationshipDuration' | 'currentSituation' | 'exSituation' | 'commitmentLevel' | 'mainCause' | 'impulso' | 'mainPain' | 'mainFear';
}

// ========================================
// ✅ CONSTANTES DE VELOCIDADE E PROGRESSO
// ========================================
const TYPE_SPEED = 22;                  // ms por caractere
const DELAY_BEFORE_RESPONSE = 150;
const DELAY_BEFORE_NEXT_QUESTION = 200;
const DELAY_SHOW_OPTIONS = 100;
const DELAY_BEFORE_FINAL = 300;
const BASE_PROGRESS = 14;

// Foto da Sophia no avatar do chat (fallback automático para "SS" se não carregar)
// 20/11: corte fechado no rosto (mesma foto ss-chat), hospedado no próprio site; antes vinha do ssplan.shop
const SOPHIA_AVATAR_URL = '/img/sophia-avatar.webp';

// ========================================
// ✅ CHAT 100% MASCULINO
// Lead: homem reconquistando uma mulher.
// Pergunta de gênero removida. Opções e respostas
// já fixas no masculino — sem optionsByGender,
// sem responseByGender, sem variantes /o.
// ========================================
const QUESTIONS: Question[] = [
  {
    id: 2,
    text: '¿Cuánto tiempo ha pasado desde que se separaron?',
    options: ['MENOS DE 1 SEMANA', '1-4 SEMANAS', '1-6 MESES', 'MÁS DE 6 MESES'],
    response: 'Entiendo.',
    responseByOption: {
      'MENOS DE 1 SEMANA': 'Está muy reciente, y eso juega a tu favor: ella todavía tiene todo a flor de piel. Pero también es cuando más fácil es equivocarse. Vamos con calma.',
      '1-4 SEMANAS': 'Es justo cuando ella empieza a sentir el vacío, aunque todavía no lo admita. Bien usado, este tiempo te ayuda.',
      '1-6 MESES': 'Ya pasó un tiempo, y eso no cierra nada. Lo que hagas desde hoy pesa más que todo lo que pasó en estos meses.',
      'MÁS DE 6 MESES': 'Muchos llegan aquí pensando que ya es tarde. Por lo que veo todos los días, no lo es. El camino es otro, nada más.'
    },
    dataKey: 'timeSeparation',
  },
  {
    // 19/11 (mecanismo v2, modelo Mariana Vabo): o que ele fez por impulso, no lugar de "¿qué crees que la fue alejando?"
    // Alimenta a Ancla del Dolor no diagnóstico. GA4 id novo (11) para não misturar com as respostas antigas (id 8).
    id: 11,
    text: 'Y dime algo con sinceridad: cuando ella se alejó, ¿qué hiciste sin pensar mucho?',
    options: ['LE MANDÉ UN MENSAJE LARGUÍSIMO', 'LA LLAMÉ VARIAS VECES', 'LE PEDÍ PERDÓN Y OTRA OPORTUNIDAD', 'LA VIGILÉ EN REDES (O PEDÍ A ALGUIEN QUE LO HICIERA)', 'NO HICE NADA, ME QUEDÉ CALLADO'],
    response: 'Gracias por contármelo.',
    responseByOption: {
      'LE MANDÉ UN MENSAJE LARGUÍSIMO': 'Casi todos lo hacen. Lo escribiste con el corazón, pero ella lo leyó con el lado racional. Más adelante te explico qué le grabó en el cerebro.',
      'LA LLAMÉ VARIAS VECES': 'Es el impulso de casi todos, no eres el único. Pero cada llamada sin respuesta le dejó una marca que hay que borrar. Ya vas a ver cuál.',
      'LE PEDÍ PERDÓN Y OTRA OPORTUNIDAD': 'Pedir perdón no está mal. El problema es pedirlo así, en este momento. Más adelante te explico por qué la alejó y cómo se corrige.',
      'LA VIGILÉ EN REDES (O PEDÍ A ALGUIEN QUE LO HICIERA)': 'Gracias por la honestidad. Casi ningún hombre lo admite, y casi todos lo hacen. Eso me dice cuánto te importa. Ahora vamos a usar esa energía bien.',
      'NO HICE NADA, ME QUEDÉ CALLADO': 'Quedarte quieto no la presionó, y eso es bueno. Pero el silencio solo tampoco la trae de vuelta. Ya te digo qué falta.'
    },
    dataKey: 'impulso',
  },
  {
    // TESTE 4: dor no lugar de "cuánto tiempo estuvieron juntos"
    id: 9,
    text: 'Ahora quiero entenderte mejor. ¿Qué es lo que más te duele hoy?',
    options: ['QUE ME DEJE EN VISTO', 'VIVIR CON ELLA COMO DOS DESCONOCIDOS', 'IMAGINARLA CON OTRO', 'QUE ME DIGA QUE ME QUIERE, PERO NO LO SUFICIENTE', 'LLEGAR A CASA Y NO SENTIR EL CALOR DE HOGAR'],
    response: 'Te entiendo.',
    responseByOption: {
      'QUE ME DEJE EN VISTO': 'Ver el mensaje leído y sin respuesta angustia, y es normal revisarlo a cada rato. Pero si le escribes de más, cada mensaje le graba a su cerebro una sola idea: este hombre trae presión. Yo lo llamo el Ancla del Dolor. Desde hoy no la hundes más.',
      'VIVIR CON ELLA COMO DOS DESCONOCIDOS': 'Estar cerca y sentirse invisible es de lo más duro que hay. Y tiene arreglo: muchas veces empieza por que ella vuelva a verte distinto.',
      'IMAGINARLA CON OTRO': 'Esa imagen no te deja dormir, lo sé. Lo que imaginas casi siempre es peor que lo que pasa de verdad. Y aunque hubiera alguien, eso no cierra la puerta.',
      'QUE ME DIGA QUE ME QUIERE, PERO NO LO SUFICIENTE': 'Esa frase es la clave de tu caso. El "te quiero" es real: el cariño sigue encendido en su cerebro. Lo que se apagó son las ganas de estar contigo. Y eso tiene arreglo.',
      'LLEGAR A CASA Y NO SENTIR EL CALOR DE HOGAR': 'Extrañar tu casa, tu familia, la rutina con ella… es lo que más pesa en relaciones largas. Y justo por esa historia, hay mucho de dónde reconstruir.'
    },
    dataKey: 'mainPain',
  },
  {
    id: 5,
    text: 'Ahora cuéntame: ¿cómo está hoy el contacto entre ustedes?',
    options: ['CONTACTO CERO', 'ME IGNORA', 'BLOQUEADO', 'SÓLO TEMAS NECESARIOS', 'VIVIMOS JUNTOS PERO DISTANTES', 'HABLAMOS A VECES', 'SOMOS AMIGOS', 'ENCUENTROS ÍNTIMOS'],
    response: 'Entiendo.',
    responseByOption: {
      'CONTACTO CERO': 'El contacto cero se siente correcto, pero le habla al lado racional de su cerebro, el que no se enamora. Mientras tú esperas, ella se acostumbra a vivir sin ti. Más adelante te digo cuándo y cómo romperlo.',
      'ME IGNORA': 'Cuando te ignora, no es indiferencia. Es su lado racional en guardia. Y esa guardia baja cuando dejas de empujar.',
      'BLOQUEADO': 'El bloqueo parece el final, pero es lo contrario. Nadie bloquea a quien le es indiferente. Se bloquea a quien todavía le mueve algo por dentro.',
      'SÓLO TEMAS NECESARIOS': 'Que todavía hablen, aunque sea de lo necesario, es una puerta abierta. Lo importante es cómo te ve en esas conversaciones.',
      'VIVIMOS JUNTOS PERO DISTANTES': 'Vivir bajo el mismo techo y sentirse lejos duele mucho. Pero verla todos los días es una ventaja enorme si sabes qué hacer y qué no.',
      'HABLAMOS A VECES': 'Que hablen de vez en cuando es muy buena señal. El canal está abierto, falta cambiar lo que ella siente cuando habla contigo.',
      'SOMOS AMIGOS': 'La amistad puede ser una trampa o un puente. Depende de lo que hagas en los próximos días.',
      'ENCUENTROS ÍNTIMOS': 'Si todavía hay intimidad, la atracción sigue viva. Falta que vuelva a verte como su pareja.'
    },
    dataKey: 'currentSituation',
  },
  {
    id: 6,
    text: '¿Y ella ya está con otra persona?',
    options: ['ESTÁ SOLTERA', 'NO ESTOY SEGURO', 'SALIENDO CASUAL', 'RELACIÓN SERIA', 'VARIAS PERSONAS'],
    response: 'Entiendo.',
    responseByOption: {
      'ESTÁ SOLTERA': 'Bien. Si está sola, nadie está ocupando tu lugar. Ese espacio es tuyo, pero no va a esperar para siempre.',
      'NO ESTOY SEGURO': 'Tranquilo, es lo más común. Tu plan va a servir en los dos casos.',
      'SALIENDO CASUAL': 'Si es algo casual, no hay nada firme. No compitas con él: lo que funciona es que ella vuelva a comparar, sin que tú la presiones.',
      'RELACIÓN SERIA': 'Duele, lo sé. Pero muchas veces una relación nueva es una anestesia para no sentir lo que dejó contigo. Él tiene su presente. Tú tienes su historia, y ahí está lo que la hace volver.',
      'VARIAS PERSONAS': 'Si está con varias personas, está buscando algo que todavía no encuentra. Eso dice mucho de lo que siente.'
    },
    dataKey: 'exSituation',
  },
  {
    // TESTE 4: medo da perda no lugar da escala de compromiso 1-4
    id: 10,
    text: 'Última pregunta, y es la más importante. Si no haces nada, ¿qué es lo que más miedo te da?',
    options: ['QUE SE ACOSTUMBRE A VIVIR SIN MÍ', 'QUE SE ENAMORE DE OTRO', 'PERDER A MI FAMILIA', 'QUE VOLVAMOS Y PASE LO MISMO'],
    response: 'Te entiendo.',
    responseByOption: {
      'QUE SE ACOSTUMBRE A VIVIR SIN MÍ': 'Ese miedo tiene sentido: el tiempo sin hacer nada sí juega en contra. Por eso tu plan empieza hoy, no cuando te sientas listo.',
      'QUE SE ENAMORE DE OTRO': 'Es el miedo de casi todos los hombres que me escriben. Por eso no puedes quedarte quieto ni actuar por impulso. Hay un momento para cada paso.',
      'PERDER A MI FAMILIA': 'Cuando hay hijos y años de historia, hay más en juego. Y también más de dónde reconstruir. No es tarde.',
      'QUE VOLVAMOS Y PASE LO MISMO': 'Me gusta que lo pienses. Volver no sirve si todo sigue igual. Por eso el plan no es solo para que vuelva, es para que esta vez funcione.'
    },
    dataKey: 'mainFear',
  }
];

export default function Chat({ onNavigate }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [progress, setProgress] = useState(BASE_PROGRESS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  // Se a foto da Sophia não carregar, volta para as iniciais "SS"
  const [avatarFailed, setAvatarFailed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Chat v6 (22/11): hora de cada balão, fixada quando ele aparece (estilo WhatsApp)
  const timesRef = useRef<string[]>([]);
  const horaDe = (idx: number) => {
    if (!timesRef.current[idx]) {
      timesRef.current[idx] = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    }
    return timesRef.current[idx];
  };
  const typewriterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const optionsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ========================================
  // ✅ SISTEMA DE PRESERVAÇÃO DE UTMs
  // ========================================
  const ensureUTMs = () => {
    try {
      const storedUTMs = localStorage.getItem('quiz_utms');
      if (storedUTMs) {
        const utms = JSON.parse(storedUTMs);
        console.log('✅ UTMs preservadas no Chat:', utms);
        if (window.location.search === '' && Object.keys(utms).length > 0) {
          const utmString = Object.entries(utms)
            .map(([key, value]) => `${key}=${encodeURIComponent(value as string)}`)
            .join('&');
          window.history.replaceState({}, '', `${window.location.pathname}?${utmString}`);
          console.log('✅ UTMs anexadas à URL do Chat');
        }
      } else {
        console.log('ℹ️ Nenhuma UTM armazenada encontrada');
      }
    } catch (error) {
      console.error('❌ Erro ao preservar UTMs:', error);
    }
  };

  // ========================================
  // ✅ GARANTE gender = 'HOMBRE' NO STORAGE
  // ========================================
  // Sem a pergunta de gênero, quizData.gender ficaria '' e o
  // contentByGender.getCopy cairia no pronome errado.
  // Isso grava 'HOMBRE' antes de qualquer página consumir o dado.
  const ensureGender = () => {
    try {
      const quizData = storage.getQuizData();
      if (!quizData.gender) {
        quizData.gender = 'HOMBRE';
        storage.saveQuizData(quizData);
      }
    } catch (error) {
      console.error('❌ Erro ao garantir gênero:', error);
    }
  };

  useEffect(() => {
    ensureUTMs();
    ensureGender();
    ga4Tracking.chatPageView();
    ga4Tracking.chatStarted();

    // ✅ ABERTURA v5 (20/11): 1 balão que continua a landing (região do cérebro) e já vai para a P1.
    // Antes: 2 balões (9.000 hombres + 6 preguntas) → opções em ~6,8 s; agora ~3,9 s. Ver expert-lucas/copies/chat-abertura-v5.md
    const intro: Message = {
      type: 'bot',
      text: 'Hola, soy Sophia. Esa región de su cerebro se puede volver a encender. Con 6 respuestas te digo cómo hacerlo en tu caso.',
      isTyping: true,
    };
    setMessages([intro]);

    typewriterTimeoutRef.current = setTimeout(() => {
      setMessages([{ ...intro, isTyping: false }]);
      optionsTimeoutRef.current = setTimeout(() => {
        askQuestion(0);
      }, DELAY_SHOW_OPTIONS);
    }, intro.text.length * TYPE_SPEED);

    return () => {
      if (typewriterTimeoutRef.current) clearTimeout(typewriterTimeoutRef.current);
      if (optionsTimeoutRef.current) clearTimeout(optionsTimeoutRef.current);
    };
  }, []);

  // Bloco 1 (19/11): rola também quando as opções/botão final aparecem (antes nasciam abaixo da dobra)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showOptions]);

  const askQuestion = (questionIndex: number) => {
    const question = QUESTIONS[questionIndex];
    const newMessage: Message = {
      type: 'bot',
      text: question.text,
      isTyping: true,
    };
    setMessages(prev => [...prev, newMessage]);
    typewriterTimeoutRef.current = setTimeout(() => {
      setMessages(prev => prev.map((msg, idx) =>
        idx === prev.length - 1 ? { ...msg, isTyping: false } : msg
      ));
      optionsTimeoutRef.current = setTimeout(() => {
        setShowOptions(true);
        setIsProcessing(false);
      }, DELAY_SHOW_OPTIONS);
    }, question.text.length * TYPE_SPEED);
  };

  const handleAnswer = (option: string) => {
    playKeySound();
    const question = QUESTIONS[currentQuestion];
    setMessages(prev => [...prev, { type: 'user', text: fmtOpcao(option) }]);
    setShowOptions(false);
    setIsProcessing(true);

    const answer: QuizAnswer = {
      questionId: question.id,
      question: question.text,
      answer: option,
    };

    const quizData = storage.getQuizData();
    quizData.answers.push(answer);
    quizData[question.dataKey] = option;
    storage.saveQuizData(quizData);

    ga4Tracking.questionAnswered(question.id, question.text, option);

    const stepSize = (100 - BASE_PROGRESS) / QUESTIONS.length;
    const newProgress = BASE_PROGRESS + (currentQuestion + 1) * stepSize;
    setProgress(newProgress);

    setTimeout(() => {
      setIsProcessing(false);

      // Resposta por opção escolhida; fallback para a resposta padrão
      const responseText =
        (question.responseByOption && question.responseByOption[option]) ||
        question.response;

      const responseMessage: Message = {
        type: 'bot',
        text: responseText,
        isTyping: true,
      };
      setMessages(prev => [...prev, responseMessage]);

      typewriterTimeoutRef.current = setTimeout(() => {
        setMessages(prev => prev.map((msg, idx) =>
          idx === prev.length - 1 ? { ...msg, isTyping: false } : msg
        ));

        if (currentQuestion < QUESTIONS.length - 1) {
          optionsTimeoutRef.current = setTimeout(() => {
            setCurrentQuestion(currentQuestion + 1);
            askQuestion(currentQuestion + 1);
          }, DELAY_BEFORE_NEXT_QUESTION);
        } else {
          ga4Tracking.chatCompleted();
          optionsTimeoutRef.current = setTimeout(() => {
            const finalMessage: Message = {
              type: 'bot',
              text: 'Listo. Ya sé qué disparador vuelve a encender sus ganas por ti. Toca abajo y te lo muestro.',
              isTyping: true,
            };
            setMessages(prev => [...prev, finalMessage]);
            typewriterTimeoutRef.current = setTimeout(() => {
              setMessages(prev => prev.map((msg, idx) =>
                idx === prev.length - 1 ? { ...msg, isTyping: false } : msg
              ));
              optionsTimeoutRef.current = setTimeout(() => {
                setShowOptions(true);
                setIsProcessing(false);
              }, DELAY_SHOW_OPTIONS);
            }, finalMessage.text.length * TYPE_SPEED);
          }, DELAY_BEFORE_FINAL);
        }
      }, responseText.length * TYPE_SPEED);
    }, DELAY_BEFORE_RESPONSE);
  };

  const handleViewPlan = () => {
    ga4Tracking.chatCTAClick();
    onNavigate('resultado');
  };

  // Com opções fixas, não há mais leitura de gender por render.
  const getQuestionOptions = (question: Question): string[] => {
    return question.options;
  };

  const isComplete = progress >= 100;
  const quizData = storage.getQuizData();
  // Chat v6 (22/11): estilo conversa de WhatsApp (escuro). Só visual: perguntas, tempos e GA4 iguais.
  const escribiendo = isProcessing || messages.some(m => m.isTyping);
  const respondidas = messages.filter(m => m.type === 'user').length;

  return (
    <div className="chat-container chat4 wa">
      <div className="wa-head">
        {avatarFailed ? (
          <div className="wa-avatar wa-avatar-txt">SS</div>
        ) : (
          <img
            src={SOPHIA_AVATAR_URL}
            alt="Sophia Sanchez"
            className="wa-avatar"
            width={42}
            height={42}
            decoding="async"
            onError={() => setAvatarFailed(true)}
          />
        )}
        <div className="wa-who">
          <p className="wa-name">Sophia Sanchez</p>
          <p className={`wa-status${escribiendo ? ' on' : ''}`}>{escribiendo ? 'escribiendo…' : 'en línea'}</p>
        </div>
        <span className="wa-step">Análisis {Math.min(respondidas, QUESTIONS.length)}/{QUESTIONS.length}</span>
        <div className="wa-line" style={{ width: `${progress}%` }} />
      </div>

      <div className="chat-messages">
        <div className="wa-day">Hoy</div>
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.type}${idx > 0 && messages[idx - 1].type === msg.type ? ' seq' : ''}`}>
            <div className={`message-bubble${msg.isTyping ? ' typing' : ''}`}>
              {msg.isTyping ? (
                <span className="wa-dots"><i /><i /><i /></span>
              ) : (
                <>
                  {msg.text}
                  <span className="wa-meta">
                    {horaDe(idx)}
                    {msg.type === 'user' && <span className="wa-ticks">✓✓</span>}
                  </span>
                </>
              )}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="message bot seq">
            <div className="message-bubble typing"><span className="wa-dots"><i /><i /><i /></span></div>
          </div>
        )}

        {showOptions && currentQuestion >= 0 && currentQuestion < QUESTIONS.length && !isComplete && (
          <div className="options-container">
            {getQuestionOptions(QUESTIONS[currentQuestion]).map((option, idx) => (
              <button key={idx} className="option-button" onClick={() => handleAnswer(option)}>
                {fmtOpcao(option)}
              </button>
            ))}
          </div>
        )}

        {showOptions && isComplete && (
          <div className="options-container">
            <div 
              className="completion-badge" 
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '24px',
                background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.2), rgba(74, 222, 128, 0.1))',
                borderRadius: '16px',
                marginBottom: '16px',
                border: '2px solid rgba(234, 179, 8, 0.5)',
                boxShadow: '0 8px 24px rgba(234, 179, 8, 0.3)'
              }}
            >
              <div style={{
                fontSize: 'clamp(1.5rem, 5vw, 2rem)',
                fontWeight: '900',
                color: 'rgb(250, 204, 21)',
                textAlign: 'center',
                lineHeight: '1.3'
              }}>
                {getCompletionBadge(quizData.gender || 'HOMBRE').title}
              </div>
              <div style={{
                fontSize: 'clamp(1rem, 4vw, 1.25rem)',
                color: 'white',
                lineHeight: '1.6',
                textAlign: 'center'
              }}>
                {getCompletionBadge(quizData.gender || 'HOMBRE').subtitle}
              </div>
            </div>
            <button className="option-button cta-final" onClick={handleViewPlan}>
              VER MI PLAN PERSONALIZADO
            </button>
            <p className="completion-count">Más de 9.000 hombres ya vieron su plan</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat v6 (22/11/2026): estilo conversa de WhatsApp escuro (sem logo/marca), opções como respostas rápidas, sem barra de digitar */}
      <style>{`
        .chat4, .chat4 * { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
        .chat4.wa { max-width: none; padding: 0; min-height: 100vh; min-height: 100dvh; background-color: #0b141a; background-image: url("${WA_WALLPAPER}"); background-size: 260px 260px; }
        .chat4 .wa-head { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #202c33; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
        .chat4 .wa-avatar { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; object-position: 50% 35%; flex-shrink: 0; }
        .chat4 .wa-avatar-txt { display: flex; align-items: center; justify-content: center; background: #00a884; color: #0b141a; font-weight: 700; }
        .chat4 .wa-who { min-width: 0; }
        .chat4 .wa-name { margin: 0; color: #e9edef; font-size: 1.05rem; font-weight: 600; line-height: 1.25; }
        .chat4 .wa-status { margin: 0; color: #8696a0; font-size: 0.82rem; line-height: 1.3; }
        .chat4 .wa-status.on { color: #00a884; }
        .chat4 .wa-step { margin-left: auto; flex-shrink: 0; color: #8696a0; font-size: 0.78rem; border: 1px solid rgba(134,150,160,0.35); border-radius: 12px; padding: 3px 9px; }
        .chat4 .wa-line { position: absolute; left: 0; bottom: 0; height: 2px; background: #00a884; transition: width 0.5s ease; }
        .chat4 .chat-messages { max-width: 700px; width: 100%; margin: 0 auto; padding: 12px 12px 28px; }
        .chat4 .wa-day { width: fit-content; margin: 2px auto 14px; padding: 5px 12px; border-radius: 8px; background: #182229; color: #8696a0; font-size: 0.8rem; }
        .chat4 .message { margin: 10px 0 0; gap: 0; }
        .chat4 .message.seq { margin-top: 3px; }
        .chat4 .message-bubble { position: relative; max-width: 84%; padding: 7px 10px 8px; border: none; border-radius: 8px; color: #e9edef; font-weight: 400; font-size: clamp(1rem, 4.3vw, 1.08rem); line-height: 1.45; box-shadow: 0 1px 0.5px rgba(11,20,26,0.3); }
        .chat4 .message.bot .message-bubble { background: #202c33; color: #e9edef; border: none; }
        .chat4 .message.user .message-bubble { background: #005c4b; color: #e9edef; border: none; font-weight: 400; }
        .chat4 .message.bot:not(.seq) .message-bubble { border-top-left-radius: 0; }
        .chat4 .message.user:not(.seq) .message-bubble { border-top-right-radius: 0; }
        .chat4 .message.bot:not(.seq) .message-bubble::before { content: ''; position: absolute; top: 0; left: -8px; border-top: 0 solid transparent; border-right: 8px solid #202c33; border-bottom: 10px solid transparent; }
        .chat4 .message.user:not(.seq) .message-bubble::before { content: ''; position: absolute; top: 0; right: -8px; border-left: 8px solid #005c4b; border-bottom: 10px solid transparent; }
        .chat4 .wa-meta { float: right; margin: 8px 0 -5px 12px; font-size: 0.7rem; color: rgba(233,237,239,0.6); white-space: nowrap; }
        .chat4 .wa-ticks { margin-left: 3px; color: #53bdeb; letter-spacing: -3px; }
        .chat4 .message-bubble.typing { padding: 12px 14px; }
        .chat4 .wa-dots { display: inline-flex; gap: 4px; }
        .chat4 .wa-dots i { width: 7px; height: 7px; border-radius: 50%; background: #8696a0; animation: waDot 1.2s infinite ease-in-out; }
        .chat4 .wa-dots i:nth-child(2) { animation-delay: 0.15s; }
        .chat4 .wa-dots i:nth-child(3) { animation-delay: 0.3s; }
        @keyframes waDot { 0%, 60%, 100% { opacity: 0.35; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
        .chat4 .options-container { margin-top: 10px; gap: 6px; }
        .chat4 .option-button { width: 100%; background: #202c33; color: #00a884; border: none; border-radius: 8px; box-shadow: 0 1px 0.5px rgba(0,0,0,0.35); text-transform: none; letter-spacing: 0; text-align: center; font-size: clamp(1rem, 4.2vw, 1.06rem); line-height: 1.35; font-weight: 600; padding: 0.85rem 1rem; }
        .chat4 .option-button:hover, .chat4 .option-button:active { transform: none; background: #2a3942; box-shadow: 0 1px 0.5px rgba(0,0,0,0.35); }
        .chat4 .option-button.cta-final { background: #00a884; color: #0b141a; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; padding: 1rem; }
        .chat4 .option-button.cta-final:hover, .chat4 .option-button.cta-final:active { background: #06cf9c; }
        .chat4 .completion-count { color: #8696a0; }
      `}</style>
    </div>
  );
}

// Mostra as opções em frase normal ("Le mandé un mensaje larguísimo"); o valor salvo continua em caixa alta
function fmtOpcao(t: string): string {
  const low = t.toLocaleLowerCase('es');
  return low.charAt(0).toLocaleUpperCase('es') + low.slice(1);
}

// Chat v6 (22/11): fundo de conversa próprio (desenhos simples em SVG, não é o papel de parede do app)
const WA_WALLPAPER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260" viewBox="0 0 260 260" fill="none" stroke="#ffffff" stroke-opacity="0.045" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M40 52c-6-8-20-4-18 7 2 9 18 18 18 18s16-9 18-18c2-11-12-15-18-7z"/>' +
  '<path d="M150 30l5 11 12 2-9 8 2 12-10-6-10 6 2-12-9-8 12-2z"/>' +
  '<rect x="200" y="70" width="38" height="28" rx="8"/><path d="M208 98l-4 10 12-10"/>' +
  '<circle cx="95" cy="120" r="14"/><path d="M89 118h.01M101 118h.01M89 126c4 4 8 4 12 0"/>' +
  '<path d="M30 180l10-14 10 14-10 14z"/>' +
  '<path d="M172 178v-22l14-4v22"/><circle cx="168" cy="178" r="4"/><circle cx="182" cy="174" r="4"/>' +
  '<path d="M120 210c10-6 20 6 30 0"/><path d="M120 222c10-6 20 6 30 0"/>' +
  '<circle cx="228" cy="200" r="6"/><circle cx="60" cy="235" r="4"/>' +
  '<path d="M215 245l6-6m0 6l-6-6"/><path d="M110 60h18m-9-9v18"/>' +
  '</svg>'
);
