#!/bin/bash
set -e

if [[ -d "modules/node" ]]
then cd modules/node
elif [[ ! -f "src/main.ts" && ! -f "dist/src/main.js" ]]
then echo "Fatal: couldn't find file to run" && exit 1
fi

if [[ -z "$INDRA_PG_PASSWORD" && -n "$INDRA_PG_PASSWORD_FILE" ]]
then export INDRA_PG_PASSWORD="`cat $INDRA_PG_PASSWORD_FILE`"
fi

if [[ -z "$INDRA_ETH_MNEMONIC" && -n "$INDRA_ETH_MNEMONIC_FILE" ]]
then
  export INDRA_ETH_MNEMONIC="`cat $INDRA_ETH_MNEMONIC_FILE`"
fi

function wait_for {
  name=$1
  target=$2
  tmp=${target#*://} # remove protocol
  host=${tmp%%/*} # remove path if present
  if [[ ! "$host" =~ .*:[0-9]{1,5} ]] # no port provided
  then
    echo "$host has no port, trying to add one.."
    if [[ "${target%://*}" == "http" ]]
    then host="$host:80"
    elif [[ "${target%://*}" == "https" ]]
    then host="$host:443"
    else echo "Error: missing port for host $host derived from target $target" && exit 1
    fi
  fi
  echo "Waiting for $name at $target ($host) to wake up..."
  wait-for -t 60 $host 2> /dev/null
}

wait_for "database" "$INDRA_PG_HOST:$INDRA_PG_PORT"
wait_for "nats" "$INDRA_NATS_SERVERS"
wait_for "redis" "$INDRA_REDIS_URL"


# FIXME: the below works, as in it parses the connection info correctly:
# Waiting for ethprovider_1337 at http://ethprovider_1337:8545 (ethprovider_1337:8545) to wake up...
# Waiting for ethprovider_1338 at http://ethprovider_1338:8545 (ethprovider_1338:8545) to wake up...
# But it seems the second eth provider is not found....

# Wait for all eth providers
chains=()
urls=()

# Parse json string
for chain in `echo ${INDRA_CHAIN_PROVIDERS} | jq 'keys[]' | sed -e 's/^"//' -e 's/"$//'`
do
  chains+=($chain)
done
for url in `echo ${INDRA_CHAIN_PROVIDERS} | jq '.[]' | sed -e 's/^"//' -e 's/"$//'`
do
  urls+=("$url")
done

for index in "${!chains[@]}"
do
  wait_for "ethprovider_${chains[$index]}" "${urls[$index]}"
done

if [[ "$NODE_ENV" == "development" ]]
then
  echo "Starting indra node in dev-mode"
  exec ./node_modules/.bin/nodemon \
    --delay 1 \
    --exitcrash \
    --ignore *.test.ts \
    --ignore *.swp \
    --legacy-watch \
    --polling-interval 1000 \
    --watch src \
    --exec ts-node \
    ./src/main.ts
else
  echo "Starting indra node in prod-mode"
  if [[ -n "$INSPECT" ]]
  then
    exec node --inspect=0.0.0.0:9229 --no-deprecation dist/src/main.js
  else
    exec node --no-deprecation dist/src/main.js
  fi
fi

