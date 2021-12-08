"use strict";

// Variaveis para o WebSocket
var connection = null;
var clientID = 0;

// A variavel mediaConstraints descreve que tipo de stream nos iremos usar
// Aqui, especificamos que usaremos os dois, audio e video.
// Mas tambem podemos especificar outros parametros para recuperar o video em outras
// resolucoes. E em dispositivos mobiles podemos especificar qual camera o usuario
// deseja usar.
var isOfferer;


var mediaConstraints = {
  audio: true, // Usaremos comunicacao de audio
  video: true // E tambem de video
  //video: {              // Especificamos esse para validar resolucoes da camera
  //width: { min: 1024, ideal: 1280, max: 1920 },
  //height: { min: 776, ideal: 720, max: 1080 }
  //}
  //video: { facingMode: "user" } // Camera Frontal
  //video: { facingMode: { exact: "environment" } } // Camera Traseira
};

var myUsername = null;
var targetUsername = null; // Para armazenar o usuario remoto
var myPeerConnection = null; // RTCPeerConnection


// Para trabalhar com ou sem addTrack() precisamos verificar se esta disponivel
var hasAddTrack = false;


/**
 *  Metodo para log com horario atual
 * @param {string} text 
 */
function log(text) {
  var time = new Date();
  console.log("[" + time.toLocaleTimeString() + "] " + text);
}

/**
 *  Metodo para log de erro com horario atual
 * @param {string} text 
 */
function log_error(text) {
  var time = new Date();
  console.error("[" + time.toLocaleTimeString() + "] " + text);
}

/**
 * Manda para o server um Objeto javascript convertendo em JSON 
 * com os valores: tipo de mensagem e a mensagem
 * @param {Object} msg 
 */
function sendToServer(msg) {
  var msgJSON = JSON.stringify(msg);

  log("Sending '" + msg.type + "' message: " + msgJSON);
  connection.send(msgJSON);
}

/**
 * Quando a mensagem "id" for recebida, esse metodo ira enviar a mesma para os server
 * assosiando a sessao do usuario a um ID unico, em resposta esse metodo enviara
 * uma mensagem com o tipo "username" para setar o usuario a essa sessao
 */
function setUsername() {
  myUsername = document.getElementById("name").value;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
  sendToServer({
    name: myUsername,
    date: Date.now(),
    id: clientID,
    type: "username"
  });
}

/**
 * Configuracao do server WebSocket
 */
function connect() {
  var serverUrl;
  var scheme = "ws";

  /**
   * Se for uma conexao HTTPS, estaremos seguro a usar WebSocket,
   * entao adicionaremos mais um s para a variavel "scheme"
   */
  if (document.location.protocol === "https:") {
    scheme += "s";
  }
  /**
   * Como estou usando o heroku para servir como server,
   * redicionaremos a pagina hospedada no heroku para fazer a conexao
   */
  serverUrl = scheme + "://webrtcmgl.herokuapp.com";

  connection = new WebSocket(serverUrl, "json");

  /**
   * Quando abrir a conexao, ira deixar os buttons de enviar e escrever habilitados
   * @callback evt
   */
  connection.onopen = function (evt) {
    document.getElementById("text").disabled = false;
    document.getElementById("send").disabled = false;
  };

  /**
   * Sempre que tiver uma mensagem esse metodo sera ativado,
   * e aqui fica os casos para ser enviados ao server
   * como tipo "id", "username" como falado anteriormente
   * @callback evt
   */
  connection.onmessage = function (evt) {
    var chatFrameDocument = $('#chatbox');
    var text = "";
    var msg = JSON.parse(evt.data);
    log("Message received: ");
    console.dir(msg);
    var time = new Date(msg.date);
    var timeStr = time.toLocaleTimeString();

    switch (msg.type) {
      case "id":
        clientID = msg.id;
        setUsername();
        break;

      case "username":
        text = "<div class='textBlock right'><b>Usuário <em>" + msg.name + "</em> fez login em: " + timeStr + "</b><br></div>";
        break;

      case "message":
        if (msg.text.trim() === "") {
          break;
        }
        if (myUsername == msg.name) {
          text = "<div class='textBlock right'> " + "<div class='text'> <p>" + msg.text + "</p>" + "<p class='time'>" + timeStr + "</p></div> </div>";

        } else {
          text = "<div class='textBlock left'> <div class='text'>  <p class='name'>" + msg.name + "</p>" + "<p>" + msg.text + "</p>" + "<p class='time'>" + timeStr + "</p></div> </div>";
          var notification = {
            body: msg.text,
            icon: 'http://icons.iconarchive.com/icons/graphicloads/100-flat-2/256/chat-2-icon.png'
          }
          if (Notification.permission === "granted") {
            new Notification(msg.name, notification)
            
          }
        }

        break;

      case "rejectusername":
        myUsername = msg.name;
        text = "<div style='font-family: sans-serif; padding: 5px; font-size: 16px; letter-spacing: 1.1px; color: rgba(50,50,50,.8)'><b>Seu usuário foi modificado para <em>" + myUsername +
          "</em> porque o nome que você escolhe está em uso</b><br> </div>";
        break;

      case "userlist": // Quando for atualizado a userlist este case será chamado
        handleUserlistMsg(msg);
        break;


        // Mensagens de sinal: aqui começa a negociação do WebRTC
      case "video-offer": // Convite para iniciar uma conferencia
        handleVideoOfferMsg(msg);
        break;

      case "video-answer": // Resposta quando o usuario remoto aceita a conferencia
        handleVideoAnswerMsg(msg);
        break;

      case "new-ice-candidate": // Quando um candidato ICE é recebido
        handleNewICECandidateMsg(msg);
        break;

      case "hang-up": // Quando o usuário deseja desligar a conexão
        handleHangUpMsg(msg);
        break;
        // Caso receba uma mensagem desconhecida
      default:
        log_error("Mensagem desconhecida recebida:");
        log_error(msg);
        
    }

    // Se tiver algo na variável "text" é porque alguma mensagem de texto foi enviada
    if (text.length) {
      chatFrameDocument.append(text);
      $('#chatbox').animate({
        scrollTop: $('#chatbox').prop("scrollHeight")
      }, 500);
    }
  };
}

/**
 * Quando clicar no button de enviar, irá construir a mensagem com seu tipo e enviar ao server.
 */
function handleSendButton() {
  var msg = {
    text: document.getElementById("text").value,
    type: "message",
    id: clientID,
    date: Date.now()
  };
  sendToServer(msg);
  document.getElementById("text").value = "";
}

/**
 * Quando enter for pressionado nós chamamos o método handleSendButton para transmitir o texto ao server.
 * @callback evt 
 */
function handleKey(evt) {
  if (evt.keyCode === 13 || evt.keyCode === 14) {
    if (!document.getElementById("send").disabled) {
      handleSendButton();
    }
  }
}

/**
 * Cria a conexão RTC para se conectar com nossos servers STUN/TURN 
 * recebendo getUserMedia() para achar a camera e o microfone e adicionar a conexão de video conferencia
 */
function createPeerConnection() {
  log("Configurando conexão...");

  // servidores STUN/TURN para uso de testes.

  myPeerConnection = new RTCPeerConnection({
    'iceServers': [{
        urls: ["turn:173.194.72.127:19305?transport=udp",
          "turn:[2404:6800:4008:C01::7F]:19305?transport=udp",
          "turn:173.194.72.127:443?transport=tcp",
          "turn:[2404:6800:4008:C01::7F]:443?transport=tcp"
        ],
        username: "CKjCuLwFEgahxNRjuTAYzc/s6OMT",
        credential: "u1SQDR/SQsPQIxXNWQT7czc/G4c="
      },
      {
        urls: ["stun:stun.l.google.com:19302"]
      }
    ]
  }, {
    optional: [{
        DtlsSrtpKeyAgreement: true
      },
      {
        RtpDataChannels: true
      }
    ]
  });

  // Existe addTrack()? Caso não, iremos usar streams.
  hasAddTrack = (myPeerConnection.addTrack !== undefined);


  // Atribuindo os handlers para os metodos de negociação do ICE
  myPeerConnection.onicecandidate = handleICECandidateEvent;
  myPeerConnection.onremovestream = handleRemoveStreamEvent;
  myPeerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
  myPeerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
  myPeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
  myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;


  // Como addStream() não é mais recomendado para uso, e o evento addTrack() é recente,
  // Precisamos usar ele caso addTrack() não estiver disponivel
  if (hasAddTrack) {
    myPeerConnection.ontrack = handleTrackEvent;
  } else {
    myPeerConnection.onaddstream = handleAddStreamEvent;
  }
}

/**
 * Chamado pelo WebRTC para notificar que é hora de criar, ou reiniciar uma negociação ICE.
 * Inicia criando uma oferta, então atribui a mesma para a descrição da nossa midia local,
 * então envia a descrição para o chamado com o valor de uma oferta. Demonstrando o valor da midia,
 * formato, codec, resolução e etc...
 */
function handleNegotiationNeededEvent() {
  log("*** Negociação necessária");

  log("---> Criando oferta");
  myPeerConnection.createOffer().then(function (offer) {
      log("---> Criando descrição para enviar ao usuário remoto");
      return myPeerConnection.setLocalDescription(offer);
    })
    .then(function () {
      log("---> Enviando oferta para o usuário");
      sendToServer({
        name: myUsername,
        target: targetUsername,
        type: "video-offer",
        sdp: myPeerConnection.localDescription
      });
    })
    .catch(reportError);
}


/**
 * Chamado pelo WebRTC quando um evento ocorre nas midias que estão na conferência do WebRTC
 * É incluido quando streams são adicionados ou removidos da conferencia;
 * 
 * Este evento tem os seguintes campos
 * @callback event 
 * @callback RTCRtpReceiver       event.receiver
 * @callback MediaStreamTrack     event.track
 * @callback MediaStream[]        event.streams
 * @callback RTCRtpTransceiver    event.transceiver
 */
function handleTrackEvent(event) {
  log("*** Stream adicionado");
  document.getElementById("received_video").srcObject = event.streams[0];
  document.getElementById("hangup-button").disabled = false;
}

/**
 * Chamado pelo WebRTC uma chamada é respondida pelo usuário remoto
 * Podemos usar este evento para atualizar nossa   interface 
 * @callback event 
 */
function handleAddStreamEvent(event) {
  log("*** Stream adicionado");
  document.getElementById("received_video").srcObject = event.stream;
  document.getElementById("hangup-button").disabled = false;
}

/**
 * Quando alguem finalizar a conexão, este evento é chamado, removendo assim sua mediastream.
 * @callback event 
 */
function handleRemoveStreamEvent(event) {
  log("*** Stream removido");
  closeVideoCall();
}

/**
 * Cria um novo candidato ICE enviando o mesmo para o server
 * @callback event 
 */
function handleICECandidateEvent(event) {
  if (event.candidate) {
    log("Enviando ICE candidate: " + event.candidate.candidate);

    sendToServer({
      type: "new-ice-candidate",
      target: targetUsername,
      candidate: event.candidate
    });
  }
}

/**
 * Esse método é chamado quando o estado do ICE mudar
 * Caso aconteça algum erro na conexão do ICE a chamada será finalizada
 * 
 * @callback event 
 */
function handleICEConnectionStateChangeEvent(event) {
  log("*** estado do ICE connection mudado para: " + myPeerConnection.iceConnectionState);

  switch (myPeerConnection.iceConnectionState) {
    case "closed":
    case "failed":
    case "disconnected":
      closeVideoCall();
      break;
  }
}

/**
 * Esse evento irá detectar quando a conexão for fechada.
 * @callback event 
 */
function handleSignalingStateChangeEvent(event) {
  log("*** estado do WebRTC signaling mudado para: " + myPeerConnection.signalingState);
  switch (myPeerConnection.signalingState) {
    case "have-local-offer":
      isOfferer = true;
      break;
    case "closed":
      closeVideoCall();
      break;
  }
}

/**
 * Detecta quando o ICE estiver reunindo os candidatos.
 * Estados:
 * "new" : significa que nenhuma network ocorreu ainda.
 * "gathering" : significa que está reunindo os candidados,
 * "complete" : significa que reuniu os candidatos.
 * 
 * Esta ferramenta pode ficar alternando entre gathering e complete repetidamente
 * conforme necessitar e as circunstancias mudar.
 * @callback event 
 */
function handleICEGatheringStateChangeEvent(event) {
  log("*** estado do ICE gathering mudado para: " + myPeerConnection.iceGatheringState);
}

/**
 * Manda a mensagem contando a lista de usuários,
 * Essa função popular a userlistbox com todos os nomes,
 * fazendo cada um clicavel para iniciar uma chamada de video
 * @callback msg 
 */
function handleUserlistMsg(msg) {
  var i;

  var listElem = document.getElementById("userlistbox");

  while (listElem.firstChild) {
    listElem.removeChild(listElem.firstChild);
  }

  for (i = 0; i < msg.users.length; i++) {
    var item = document.createElement("li");
    item.appendChild(document.createTextNode(msg.users[i]));
    item.addEventListener("click", invite, false);

    listElem.appendChild(item);
  }
}
/**
 * Fecha a conexão RTC e reseta todas variaveis para que o usuario possa 
 * receber outra chamada se desejar.
 * Esse metodo é chamado se o usuario remoto desligar, o local desligar 
 * ou acontecer algum erro de conexão
 */
function closeVideoCall() {
  var remoteVideo = document.getElementById("received_video");
  var localVideo = document.getElementById("local_video");

  log("Desligando a chamada");

  if (myPeerConnection) {
    log("--> Cancelando conexão");

    myPeerConnection.onaddstream = null; // Para implementações antigas (Lembre-se, onaddstream não é mais recomendado para uso)
    myPeerConnection.ontrack = null; // Para novas implementações
    myPeerConnection.onremovestream = null;
    myPeerConnection.onicecandidate = null;
    myPeerConnection.oniceconnectionstatechange = null;
    myPeerConnection.onsignalingstatechange = null;
    myPeerConnection.onicegatheringstatechange = null;
    myPeerConnection.onnotificationneeded = null;

    // Parar os videos.

    if (remoteVideo.srcObject) {
      remoteVideo.srcObject.getTracks().forEach(track => track.stop());
    }

    if (localVideo.srcObject) {
      localVideo.srcObject.getTracks().forEach(track => track.stop());
    }

    remoteVideo.srcObject = null;
    localVideo.srcObject = null;
    localVideo.removeAttribute("src");
    isOfferer = false;



    // Fechar a conexão
    myPeerConnection.close();
    myPeerConnection = null;
  }

  // Desabilitar o button de desligar
  document.getElementById("hangup-button").disabled = true;
  targetUsername = null;
}

/**
 * Detecta quando o usuario remoto desligar a chamada.
 * @callback msg 
 */
function handleHangUpMsg(msg) {
  log("*** Recebido uma mensagem de hangup do outro usuário");

  closeVideoCall();
}

/**
 * Quando é desligada a chamada, envia a mensagem do tipo "hang-up",
 * para o outro usuário, isso notifica que a outra conexão irá ser desligada
 * e a interface retornar para tela sem chamada
 */
function hangUpCall() {
  closeVideoCall();
  sendToServer({
    name: myUsername,
    target: targetUsername,
    type: "hang-up"
  });
}

/**
 * Detecta quando é clicado em cima de um usuário, convidando o mesmo para uma chamada
 * de video.
 * @callback evt 
 */
function invite(evt) {
  log("Preparando o convite");
  if (myPeerConnection) {
    alert("Você não pode iniciar outra chamada ao mesmo tempo");
  } else {
    var clickedUsername = evt.target.textContent;

    if (clickedUsername === myUsername) {
      alert("Acredito que você não pode falar consigo mesmo, isso seria estranho.");
      return;
    }

    // Grava o usuario clicado para referencia futura

    targetUsername = clickedUsername;
    log("Convidando usuário: " + targetUsername);

    // Chama createPeerConnection() para inicializar a conexão com o usuário

    log("Configurando conexão para conectar com: " + targetUsername);
    createPeerConnection();

    // Configura o acesso as midias locais e adiciona a conexão
    log("Solicitando acesso a webcam...");

    navigator.mediaDevices.getUserMedia(mediaConstraints)
      .then(function (localStream) {
        log("-- Vídeo local obtido");
        document.getElementById("local_video").src = window.URL.createObjectURL(localStream);
        document.getElementById("local_video").srcObject = localStream;

        if (hasAddTrack) {
          log("-- Adicionado tracks ao PeerConnection");
          localStream.getTracks().forEach(track => myPeerConnection.addTrack(track, localStream));
        } else {
          log("-- Adicionado transmissão ao PeerConnection");
          myPeerConnection.addStream(localStream);
        }
      })
      .catch(handleGetUserMediaError);
  }
}
/**
 * Aceita a oferta de video.
 * Configura as opções locais e cria a conexão local.
 * Após isso cria e envia uma resposta a quem ligou
 * @callback msg 
 */
function handleVideoOfferMsg(msg) {
  var localStream = null;

  targetUsername = msg.name;

  // Chama create PeerConnection para iniciar a conexão

  log("Aceitando convite de: " + targetUsername);
  createPeerConnection();

  // Precisamos atribuir nossa descrição remota para a oferta SDP recebida.
  // Então nosso WebRTC sabe como se comunicar com quem enviou a oferta

  if (!isOfferer) {
    var desc = new RTCSessionDescription(msg.sdp);
    myPeerConnection.setRemoteDescription(desc)
      .then(function () {
        log("Configurando midias locais.");
        return navigator.mediaDevices.getUserMedia(mediaConstraints);
      })
      .then(function (stream) {
        log("-- Vídeo local obtido");
        localStream = stream;
        document.getElementById("local_video").src = window.URL.createObjectURL(localStream);
        document.getElementById("local_video").srcObject = localStream;

        if (hasAddTrack) {
          log("-- Adicionado tracks ao PeerConnection");
          localStream.getTracks().forEach(track => myPeerConnection.addTrack(track, localStream));
        } else {
          log("-- Adicionado transmissão ao PeerConnection");
          myPeerConnection.addStream(localStream);
        }
      })
      .then(function () {
        log("--> Criando Resposta");
        // Agora que conseguimos criar uma descrição remota, precisamos iniciar 
        // a chamada local e então criar uma resposta SDP.
        // esses dados SDP descreve as informações da chamada, incluindo o codec,
        // e informações adicionais.
        return myPeerConnection.createAnswer();
      })
      .then(function (answer) {
        log("--> Atribuindo descrição local para resposta");
        // Tendo a resposta, estabilizamos como uma descrição local.
        // Isso configura o fim para que utilizaremos a chamada
        // especificado nas configurações do SDP
        return myPeerConnection.setLocalDescription(answer);
      })
      .then(function () {
        var msg = {
          name: myUsername,
          target: targetUsername,
          type: "video-answer",
          sdp: myPeerConnection.localDescription,
        };

        // Nós configuramos o fim da chamada agora. 
        // Enviamos de volta para quem ligou para que ele saiba que queremos 
        // nos comunicar e como comunicaremos
        log("Enviando o pacote de volta ao outro usuário");
        sendToServer(msg);
      })
      .catch(handleGetUserMediaError);
  } else {
    isOfferer = false;
  }
}



// Responde a mensagem do tipo "video-answer" enviada para quem ligou
// uma vez que chamada ela decide aceitar ou rejeitar a falar
function handleVideoAnswerMsg(msg) {
  log("O usuário aceitou sua chamada");

  // Configura a descrição remota, que contem em nossa mensagem "video-answer"
  var desc = new RTCSessionDescription(msg.sdp);
  myPeerConnection.setRemoteDescription(desc).catch(reportError);
}

// Cria um novo candidato ICE enviado da outra conexão.
// Chama RTCPeerConnection.addIceCandidate() para enviar ao ICE framework local.
function handleNewICECandidateMsg(msg) {
  var candidate = new RTCIceCandidate(msg.candidate);

  log("Adicionando candidado ICE recebido: " + JSON.stringify(candidate));
  myPeerConnection.addIceCandidate(candidate)
    .catch(reportError);
}

/**
 * Detecta erro que ocorre quanto tenta acessar as midias locais de video e audio
 * trata excessoes emitidas pelo getUserMedia().
 * @callback e 
 */
function handleGetUserMediaError(e) {
  log(e);
  switch (e.name) {
    case "NotFoundError":
      alert("Não foi possível realizar a ligação pois sua webcam e/ou microfone não está disponível");
      break;
    case "SecurityError":
    case "PermissionDeniedError":
      // Não faça nada, pois é os mesmos quando o usuário desliga a chamada
      break;
    default:
      alert("Erro ao tentar abrir sua webcam e/ou microfone: " + e.message);
      break;
  }

  // Tenha certeza de fechar a chamada para que outra possa ocorrer
  closeVideoCall();
}

// Detecta erros de report.
function reportError(errMessage) {
  log_error("Error " + errMessage.name + ": " + errMessage.message);
}